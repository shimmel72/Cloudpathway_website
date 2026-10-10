#!/usr/bin/env bash
# Cloudpathway website — install, update, roll back, and hand the domain back.
#
#   sudo bash deploy/install.sh install --domain info.cloudpathway.org --dry-run   # look first; changes nothing
#   sudo bash deploy/install.sh install --domain info.cloudpathway.org
#   sudo bash deploy/install.sh update            # after `git pull` in this checkout
#   sudo bash deploy/install.sh rollback          # back to the release that served before this one
#   sudo bash deploy/install.sh restore-old-site  # give the domain back to whatever served it before
#   sudo bash deploy/install.sh status
#   sudo bash deploy/install.sh test-mail --to you@example.com
#
# Options for install (all optional; the dry run says if one is needed):
#   --cloudflare-tunnel | --no-cloudflare-tunnel
#                     only when it cannot tell whether a Cloudflare tunnel on this
#                     machine carries the domain (a dashboard-managed tunnel)
#   --tls             serve HTTPS from this server where the old site did not.
#                     Not behind a tunnel, and only with a certificate that renews itself
#   --alias NAME      another hostname to redirect to the domain (www. is found automatically)
#   --port N          the app's loopback port (default 3100; fixed once installed)
#   --import-phonesystem-env [PATH]   fill the Telnyx settings from the portal's .env
#   --yes             do not stop to ask (for scripts)
#
# Written for the PhoneSystem portal's host (CentOS Stream 10 / RHEL family,
# nginx from the distribution, SELinux enforcing, Node 24, Cloudflare in front)
# and tolerant of Debian/Ubuntu. Full walkthrough: docs/deploy.md.
#
# The order is the safety: the new release is built while the current site
# keeps serving; it is switched in only if it builds; nginx is changed only once
# the app answers its health check; and if the site then does not answer through
# nginx — and, where it can be checked, from the internet — nginx is put back
# the way it was.

set -Eeuo pipefail
shopt -s inherit_errexit 2>/dev/null || true
umask 022

APP=cloudpathway-web
SVC_USER=cloudpathway
BUILD_USER=cloudpathway-build
BASE=/opt/$APP
ETC=/etc/$APP
ENV_FILE=$ETC/env
DEPLOY_CONF=$ETC/deploy.conf
STATE=$ETC/state
TAKEOVER=$STATE/nginx-takeover.tsv
IN_PROGRESS=$STATE/in-progress
UNIT=/etc/systemd/system/$APP.service
NGINX_CONF=/etc/nginx/conf.d/$APP.conf
NGINX_STAGED=/etc/nginx/conf.d/.$APP.conf.new
SITE_ACCESS_LOG=/var/log/nginx/$APP.access.log
LOG=/var/log/$APP-deploy.log
LOCK=/run/$APP-deploy.lock
DEFAULT_PORT=3100
KEEP_RELEASES=3
KEEP_DB_BACKUPS=10
MIN_FREE_KB=1572864   # a build peaks at about 1 GB: dependencies with dev tools, plus the npm cache
PS_ENV_DEFAULT=/opt/phonesystem/app/server/.env

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO=$(cd -- "$SCRIPT_DIR/.." && pwd)
PLANNER=$SCRIPT_DIR/lib/nginx-plan.mjs
ENVTOOL=$SCRIPT_DIR/lib/env-tool.mjs
CFTOOL=$SCRIPT_DIR/lib/cloudflared.mjs
ME="sudo bash $SCRIPT_DIR/install.sh"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

# ------------------------------------------------------------------ output --
if [[ -t 1 ]]; then B=$'\e[1m'; R=$'\e[31m'; Y=$'\e[33m'; G=$'\e[32m'; N=$'\e[0m'; else B='' R='' Y='' G='' N=''; fi
step() { printf '\n%s==> %s%s\n' "$B" "$*" "$N"; }
info() { printf '    %s\n' "$*"; }
ok()   { printf '    %sok%s  %s\n' "$G" "$N" "$*"; }
warn() { printf '    %swarn%s %s\n' "$Y" "$N" "$*" >&2; }
die()  { printf '\n%serror:%s %s\n' "$R" "$N" "$*" >&2; exit 1; }
# shellcheck disable=SC2154  # rc is assigned inside the trap string
trap 'rc=$?; printf "\n%serror:%s line %s exited %s: %s\n" "$R" "$N" "$LINENO" "$rc" "$BASH_COMMAND" >&2' ERR

usage() { sed -n '2,/^# Written for/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

# ------------------------------------------------------------------ args ----
CMD=${1:-}; [[ -n $CMD ]] || usage 2; shift || true
DOMAIN= ; PORT= ; DRY_RUN=0 ; ASSUME_YES=0 ; IMPORT_PS= ; MAIL_TO= ; FLAG_TUNNEL= ; WANT_TLS=0
ALIASES=()
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain) DOMAIN=${2:-}; shift 2 ;;
    --domain=*) DOMAIN=${1#*=}; shift ;;
    --alias) ALIASES+=("${2:-}"); shift 2 ;;
    --alias=*) ALIASES+=("${1#*=}"); shift ;;
    --port) PORT=${2:-}; shift 2 ;;
    --port=*) PORT=${1#*=}; shift ;;
    --cloudflare-tunnel) FLAG_TUNNEL=1; shift ;;
    --no-cloudflare-tunnel) FLAG_TUNNEL=0; shift ;;
    --tls) WANT_TLS=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    --import-phonesystem-env) IMPORT_PS=$PS_ENV_DEFAULT
      if [[ ${2:-} == /* ]]; then IMPORT_PS=$2; shift; fi; shift ;;
    --import-phonesystem-env=*) IMPORT_PS=${1#*=}; shift ;;
    --to) MAIL_TO=${2:-}; shift 2 ;;
    -h|--help) usage 0 ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
done

# ------------------------------------------------------- exits and signals --
# CRITICAL is set from the moment the running app is stopped until the switch
# has been checked. Inside it Ctrl-C and SIGTERM are ignored (children inherit
# that, so a stray Ctrl-C cannot kill an `nginx -t` or a `mv` halfway either),
# and any unexpected exit puts back whatever this run had changed.
CRITICAL=0 ; SWITCHED=0 ; PLAN_FILE= ; BUILD_DIR= ; BUILD_PID= ; SWITCH_PREV= ; UNIT_BACKUP=
NGINX_UNDO=()

on_exit() {
  local rc=$?
  trap '' INT TERM
  if [[ $CRITICAL -ne 0 && $rc -ne 0 ]]; then
    printf '\n%serror:%s stopped in the middle of the switch — putting back what this run changed\n' "$R" "$N" >&2
    emergency_undo || true
  fi
  if [[ $rc -eq 130 || $rc -eq 143 ]]; then
    if [[ $SWITCHED -eq 1 ]]; then
      printf '\n%sstopped%s after the switch had completed and been checked; only tidying up was left undone.\n' "$Y" "$N" >&2
    else
      printf '\n%sstopped.%s %s\n' "$Y" "$N" "${BUILD_PID:+The unfinished build is being removed. }Nothing was switched by this run; the site is as it was." >&2
    fi
  fi
  if [[ -n $BUILD_PID ]]; then
    # Everything the build account runs belongs to this build (nothing else runs as it).
    pkill -TERM -u "$BUILD_USER" 2>/dev/null || true
    sleep 1
    pkill -KILL -u "$BUILD_USER" 2>/dev/null || true
  fi
  if [[ -n $BUILD_DIR && -d $BUILD_DIR ]]; then rm -rf -- "$BUILD_DIR" || true; fi
  if [[ -n $PLAN_FILE ]]; then rm -f -- "$PLAN_FILE" || true; fi
  if [[ $CRITICAL -ne 0 ]]; then rm -f -- "$IN_PROGRESS" || true; fi
  exit "$rc"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

enter_critical() {  # $1 = what is being switched
  trap '' INT TERM QUIT
  CRITICAL=1
  printf '%s %s: %s\n' "$STAMP" "$CMD" "$1" >"$IN_PROGRESS"
}

leave_critical() {
  CRITICAL=0
  rm -f -- "$IN_PROGRESS"
  trap 'exit 130' INT
  trap 'exit 143' TERM
  trap - QUIT
}

# Most programs inherit "ignore Ctrl-C" from this script. Node does not (it
# resets signal handling as it starts), and systemctl is too important to
# trust to it: during the switch both run in a session of their own, outside
# the terminal's process group, so a Ctrl-C or a dropped SSH connection does
# not reach them at all.
node() { if ((CRITICAL)); then setsid -w node "$@"; else command node "$@"; fi; }
systemctl() { if ((CRITICAL)); then setsid -w systemctl "$@"; else command systemctl "$@"; fi; }

# ------------------------------------------------------------------ basics --
need_root() { [[ $EUID -eq 0 ]] || die "run it with sudo: $ME $CMD …"; }

take_lock() {
  exec 9>"$LOCK"
  flock -n 9 || die "another $APP deploy is running (lock: $LOCK)"
}

start_log() {
  # Everything from here on is also appended to the deploy log. If the terminal
  # goes away (an SSH connection drops), the run carries on to the end rather
  # than stopping halfway: this script ignores SIGHUP from here, and tee
  # ignores it too and keeps writing the log when the screen is gone.
  touch "$LOG"; chmod 640 "$LOG"
  local teeopt=()
  if tee --output-error=warn </dev/null >/dev/null 2>&1; then teeopt=(--output-error=warn); fi
  exec > >(trap '' INT TERM HUP; exec tee -a "${teeopt[@]}" "$LOG" 9>&-) 2>&1
  trap '' HUP
  printf '\n===== %s %s %s =====\n' "$STAMP" "$CMD" "$*" >>"$LOG"
}

git_repo() { git -C "$REPO" -c safe.directory="$REPO" "$@"; }

SAVED_DOMAIN= ; SAVED_PORT= ; SAVED_ALIASES= ; SAVED_MODE=
load_deploy_conf() {
  [[ -f $DEPLOY_CONF ]] || return 0
  local k v
  while IFS='=' read -r k v; do
    case $k in
      DOMAIN) SAVED_DOMAIN=$v ;;
      PORT) SAVED_PORT=$v ;;
      ALIASES) SAVED_ALIASES=$v ;;
      MODE) SAVED_MODE=$v ;;
    esac
  done <"$DEPLOY_CONF"
}

use_saved() {
  DOMAIN=${DOMAIN:-$SAVED_DOMAIN}
  PORT=${PORT:-${SAVED_PORT:-$DEFAULT_PORT}}
  MODE=${MODE:-$SAVED_MODE}
  if [[ ${#ALIASES[@]} -eq 0 && -n $SAVED_ALIASES ]]; then read -r -a ALIASES <<<"$SAVED_ALIASES"; fi
}

save_deploy_conf() {
  install -d -m 755 "$ETC"
  printf 'DOMAIN=%s\nPORT=%s\nALIASES=%s\nMODE=%s\n' "$DOMAIN" "$PORT" "${ALIASES[*]:-}" "$MODE" >"$DEPLOY_CONF.tmp"
  chmod 644 "$DEPLOY_CONF.tmp"; mv -f "$DEPLOY_CONF.tmp" "$DEPLOY_CONF"
}

confirm() {  # $1 = word the operator must type
  [[ $ASSUME_YES -eq 1 ]] && return 0
  # /dev/tty can exist and still not open (no controlling terminal: cron, CI,
  # `ssh host cmd`); only a successful open means someone can answer.
  if ! (: </dev/tty) 2>/dev/null; then
    die "this step needs a yes, and there is no terminal to ask on — nothing was changed. Re-run with --yes to proceed without asking."
  fi
  local answer
  printf '\n    Type %s%s%s to continue, anything else to stop: ' "$B" "$1" "$N" >/dev/tty
  read -r answer </dev/tty || true
  [[ $answer == "$1" ]] || die "stopped — nothing was changed by this step"
}

rand_token() { od -An -N8 -tx1 /dev/urandom | tr -d ' \n'; }

current_release() { [[ -L $BASE/current ]] && readlink -f "$BASE/current" || true; }

# Release directories, newest first. By NAME, which starts with a UTC timestamp:
# a build touches directory mtimes, so mtime order is not deploy order. Builds
# in progress are .building-*, and never listed.
releases_newest_first() { find "$BASE/releases" -mindepth 1 -maxdepth 1 -type d -name '[0-9]*' 2>/dev/null | sort -r; }
# Only releases that have actually served are candidates for a rollback.
served_releases_newest_first() { local d; while read -r d; do [[ -e $d/.served ]] && printf '%s\n' "$d"; done < <(releases_newest_first); }

# Every request here is to this machine. --noproxy, or a host with a system-wide
# https_proxy sends the installer's own health checks out to the internet.
# Not -f: a 503 carries the detail that says why.
health_json() { curl --noproxy '*' -sS --max-time 3 "http://127.0.0.1:$PORT/api/health" 2>/dev/null || true; }

json_get() {  # json_get '<json>' 'expr on j'
  node -e 'let j; try { j = JSON.parse(process.argv[1]); } catch { process.exit(1); } const v = (new Function("j", "return " + process.argv[2]))(j); if (v === undefined || v === null) process.exit(1); console.log(typeof v === "object" ? JSON.stringify(v) : v);' "$1" "$2"
}
plan_get() { json_get "$(cat "$PLAN_FILE")" "$1"; }
plan_set() {  # plan_set 'statement on p' [args available as a[0], a[1]…]
  node -e 'const fs=require("fs"); const f=process.argv[1]; const p=JSON.parse(fs.readFileSync(f)); const a=process.argv.slice(3); (new Function("p","a",process.argv[2]))(p,a); fs.writeFileSync(f, JSON.stringify(p,null,2));' "$PLAN_FILE" "$@"
}

wait_healthy() {  # $1 = release id expected; succeeds only if THAT release answers ok
  local want=$1 i body
  for ((i = 0; i < 40; i++)); do
    body=$(health_json)
    if [[ -n $body ]] && [[ $(json_get "$body" 'j.ok' || true) == true ]]; then
      if [[ $(json_get "$body" 'j.release' || true) == "$want" ]]; then return 0; fi
    fi
    sleep 1
  done
  return 1
}

wait_healthy_once() { [[ $(json_get "$(health_json)" 'j.ok && j.release' || true) == "$1" ]]; }

local_get() {  # local_get scheme name port addr path [curl args…] -> body; to this machine's nginx
  local scheme=$1 name=$2 port=$3 addr=$4 path=$5; shift 5
  curl --noproxy '*' -sS -k --max-time 5 --resolve "$name:$port:$addr" "$@" "$scheme://$name$path" 2>/dev/null || true
}

# A request to the site as the internet sees it. The name is looked up with
# Cloudflare's public resolver, asked over plain HTTPS, because this machine's
# own resolver — or /etc/hosts — often points it straight back here, which
# would prove nothing.
PUB_CODE= ; PUB_BODY= ; PUB_ERR= ; PUB_ADDR=
public_addr() {
  [[ -n $PUB_ADDR ]] && return 0
  local url json
  for url in "https://1.1.1.1/dns-query?name=$DOMAIN&type=A" "https://dns.google/resolve?name=$DOMAIN&type=A"; do
    json=$(curl -sS --max-time 8 -H 'accept: application/dns-json' "$url" 2>/dev/null) || continue
    PUB_ADDR=$(json_get "$json" '(j.Answer || []).filter(a => a.type === 1).map(a => a.data)[0]') && return 0
  done
  return 1
}
public_get() {  # $1 = path. Sets PUB_CODE / PUB_BODY; returns 1 if there was no HTTP answer at all.
  local how=() out errf
  if [[ -n ${CPW_TEST_PUBLIC_RESOLVE:-} ]]; then
    how=(--resolve "$CPW_TEST_PUBLIC_RESOLVE" -k)   # test beds only: a local stand-in for the edge
  elif public_addr; then
    how=(--resolve "$DOMAIN:443:$PUB_ADDR")
  else
    PUB_CODE= ; PUB_BODY= ; PUB_ERR="could not look $DOMAIN up with a public resolver"
    return 1
  fi
  PUB_CODE= ; PUB_BODY= ; PUB_ERR=
  errf=$(mktemp)
  # --noproxy: straight to the address just looked up (a proxy would resolve the name itself).
  if ! out=$(curl --noproxy '*' -sS --max-time 15 "${how[@]}" -H 'Cache-Control: no-cache' -A 'cloudpathway-installer' \
               -w '\n%{http_code}' "https://$DOMAIN$1" 2>"$errf"); then
    PUB_ERR=$(head -c 200 "$errf" | tr '\n' ' '); rm -f "$errf"
    return 1
  fi
  rm -f "$errf"
  PUB_CODE=${out##*$'\n'}
  PUB_BODY=${out%$'\n'*}
}

# ------------------------------------------------------------------ preflight
NODE_BIN= ; NGINX_VERSION=

preflight() {
  step "Checking this machine"
  [[ -r /etc/os-release ]] && . /etc/os-release && info "${PRETTY_NAME:-unknown OS}"
  case " ${ID:-} ${ID_LIKE:-} " in
    *" rhel "*|*" fedora "*|*" centos "*|*" debian "*|*" ubuntu "*) ;;
    *) warn "untested distribution — continuing, but read the plan before confirming" ;;
  esac

  local c
  for c in git node npm nginx curl flock runuser setsid pkill systemctl tar df useradd; do
    type -P "$c" >/dev/null || die "$c is not installed (docs/deploy.md, \"Before you start\")"
  done

  NODE_BIN=$(readlink -f "$(type -P node)")
  [[ $NODE_BIN == /* && -x $NODE_BIN ]] || die "could not find the node executable (got \"$NODE_BIN\")"
  case $NODE_BIN in
    /home/*|/root/*) die "node is $NODE_BIN — inside a home directory, which the service cannot see (ProtectHome). Install Node system-wide (NodeSource), as the PhoneSystem guide does." ;;
  esac
  local nv; nv=$(node -p 'process.versions.node')
  node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>20||(a===20&&b>=9)?0:1)' \
    || die "Node $nv is too old; 20.9+ is required and the server's Node 24 is what this was tested on"
  ok "node $nv at $NODE_BIN, npm $(npm --version 2>/dev/null)"

  NGINX_VERSION=$(nginx -v 2>&1 | sed -n 's#.*nginx/\([0-9.]*\).*#\1#p')
  [[ -n $NGINX_VERSION ]] || die "could not read the nginx version from \`nginx -v\`"
  nginx -t >/dev/null 2>&1 || die "nginx's current configuration does not pass \`sudo nginx -t\`. Fix that first — this installer will not build on a broken config."
  ok "nginx $NGINX_VERSION, current configuration valid"

  [[ -f $REPO/package.json ]] && grep -q '"name": "cloudpathway-website"' "$REPO/package.json" \
    || die "$REPO does not look like the Cloudpathway_website checkout"
  git_repo rev-parse --verify HEAD >/dev/null 2>&1 || die "$REPO is not a git checkout with a commit"
  if [[ -n $(git_repo status --porcelain --untracked-files=no) ]]; then
    warn "this checkout has uncommitted changes — they are NOT deployed. What deploys is the last commit, $(git_repo rev-parse --short HEAD)."
  fi
  ok "deploying $(git_repo rev-parse --short HEAD) — $(git_repo log -1 --format=%s | cut -c1-70)"

  local parent=$BASE; while [[ ! -d $parent ]]; do parent=$(dirname "$parent"); done
  local avail; avail=$(df -Pk "$parent" | awk 'NR == 2 { print $4 }')
  if [[ -n $avail ]] && (( avail < MIN_FREE_KB )); then
    die "only $((avail / 1024)) MB free on the disk holding $BASE; a build needs about $((MIN_FREE_KB / 1024)) MB. Nothing was changed."
  fi
  ok "$((avail / 1024)) MB free for the build"

  if [[ $PORT == 4000 ]]; then die "port 4000 is the PhoneSystem portal's; pick another with --port"; fi
  local holder; holder=$(ss -Hltnp "sport = :$PORT" 2>/dev/null || true)
  if [[ -n $holder ]] && ! grep -q 'next-server\|node' <<<"$holder"; then
    die "port $PORT is already in use by something else: $holder — pick another with --port"
  fi
  ok "app port 127.0.0.1:$PORT"

  if command -v getenforce >/dev/null && [[ $(getenforce) == Enforcing ]]; then
    if [[ $(getsebool httpd_can_network_connect 2>/dev/null) == *"--> on" ]]; then
      ok "SELinux enforcing; httpd_can_network_connect already on (the portal needed it too)"
    else
      info "SELinux enforcing; httpd_can_network_connect is off — it will be turned on (nginx cannot proxy without it)"
    fi
  fi
}

# ---------------------------------------------------------------- nginx plan
make_plan() {
  step "Working out what serves $DOMAIN today"
  PLAN_FILE=$(mktemp)
  local alias_args=() a
  for a in "${ALIASES[@]}"; do [[ -n $a ]] && alias_args+=(--alias "$a"); done
  nginx -T 2>/dev/null | node "$PLANNER" plan --domain "$DOMAIN" "${alias_args[@]}" --own-file "$NGINX_CONF" >"$PLAN_FILE" \
    || die "could not read nginx's configuration (\`nginx -T\`)"

  local n_conf; n_conf=$(plan_get 'j.conflicts.length')
  if [[ $n_conf -gt 0 ]]; then
    printf '\n'
    plan_get 'j.conflicts.map(c => "    " + c.file + ":" + c.line + "\n      " + c.reason).join("\n")'
    die "nothing was changed. Each of the above has to be resolved by hand first — docs/deploy.md, \"If the installer reports a conflict\"."
  fi
  local w
  while read -r w; do [[ -n $w ]] && warn "$w"; done < <(plan_get 'j.warnings.join("\n")' || true)

  check_checkout_exposure

  local kind path
  while IFS=$'\t' read -r kind path; do
    [[ $kind == confd && -e $path.cloudpathway-disabled ]] \
      && die "$path serves $DOMAIN again, and the copy this installer disabled before is still at $path.cloudpathway-disabled. Decide which one to keep (delete or move the other), then re-run. Nothing was changed."
  done < <(plan_get 'j.toDisable.map(d => d.kind + "\t" + d.path).join("\n")' || true)

  local names src
  names=$(plan_get 'j.oldServerNames.join(" ")' || true)
  src=$(plan_get 'j.source')
  case $src in
    existing-site) info "currently served by: $(plan_get 'j.toDisable.map(d => d.path).join(", ")') ($names)" ;;
    previous-install) info "already served by this site ($NGINX_CONF) — this is an update" ;;
    none) info "no server block names $DOMAIN — today nginx answers it with its default server" ;;
  esac
  local aliases; aliases=$(plan_get 'j.aliases.join(" ")' || true)
  [[ -n $aliases ]] && info "also answering for: $aliases (redirected to $DOMAIN)"
  return 0
}

# Is this checkout inside a directory nginx serves files from? Then its .git
# (the whole private repository) and source can be downloaded by anyone who
# reaches that server block. The installer never serves the checkout — it
# deploys a copy to /opt — so the checkout can live anywhere else.
EXPOSED=
check_checkout_exposure() {
  local dir src repo_real d_real
  repo_real=$(readlink -f "$REPO")
  while IFS=$'\t' read -r dir src; do
    [[ -n $dir ]] || continue
    d_real=$(readlink -f "$dir" 2>/dev/null || printf '%s' "$dir")
    [[ $d_real == / ]] && d_real=''
    if [[ $repo_real == "$d_real" || $repo_real == "$d_real"/* ]]; then
      EXPOSED="$dir ($src)"
      warn "this checkout, $repo_real, is inside $dir, which nginx serves files from ($src). Anyone who reaches that server block can download its .git directory — the whole private repository — and its source. Nothing here needs it there: after installing, move the checkout out of the web root (docs/deploy.md, \"Where the checkout lives\")."
      return 0
    fi
  done < <(plan_get 'j.servedDirs.map(r => r.path + "\t" + r.file + ":" + r.line).join("\n")' || true)
}

# What the certificate at $1 does when it nears expiry: auto | manual | unknown.
# "manual" is certbot --manual without an auth hook — it can only be renewed by
# a person, at a keyboard, by editing DNS.
cert_renewal() {
  local c=$1 name renew
  [[ $c == /etc/letsencrypt/live/*/* ]] || { echo unknown; return; }
  name=${c#/etc/letsencrypt/live/}; name=${name%%/*}
  renew=/etc/letsencrypt/renewal/$name.conf
  [[ -f $renew ]] || { echo unknown; return; }
  if grep -Eq '^\s*authenticator\s*=\s*manual\s*$' "$renew" && ! grep -Eq '^\s*manual_auth_hook\s*=\s*\S' "$renew"; then
    echo manual; return
  fi
  echo auto
}

cert_end() { command -v openssl >/dev/null && openssl x509 -in "$1" -noout -enddate 2>/dev/null | cut -d= -f2 || true; }

# ------------------------------------------------------------ how visitors arrive
# TUNNEL_STATE: none (no cloudflared here) | here (it sends the domain to this
# nginx) | elsewhere (it sends the domain somewhere else) | not-carried (its
# rules do not include the domain) | unknown (token-run: rules in the dashboard)
TUNNEL_STATE=none ; TUNNEL_NOTE= ; MODE= ; HSTS=1 ; BASE_CODE= ; PROBE_FROM=

detect_tunnel() {
  local cmdlines cfg="" f route
  # Never printed: a token-run tunnel has its secret on this command line.
  cmdlines=$( { systemctl cat cloudflared 2>/dev/null | sed -n 's/^ExecStart=//p'; ps -C cloudflared -o args= 2>/dev/null; } || true)
  if [[ -z $cmdlines ]] && ! command -v cloudflared >/dev/null; then TUNNEL_STATE=none; return; fi
  if [[ -z $cmdlines ]]; then TUNNEL_STATE=none; TUNNEL_NOTE="cloudflared is installed but neither running nor a service"; return; fi

  if grep -Eq -- '--token(-file)?([ =]|$)' <<<"$cmdlines" \
     || systemctl show cloudflared -p Environment 2>/dev/null | grep -q 'TUNNEL_TOKEN='; then
    TUNNEL_STATE=unknown
    TUNNEL_NOTE="cloudflared runs with a token: its routes live in the Cloudflare dashboard, not on this machine"
    return
  fi
  cfg=$(grep -oE -- '--config[ =][^ ]+' <<<"$cmdlines" | head -1 | sed -E 's/^--config[ =]//' || true)
  if [[ -z $cfg ]]; then
    for f in /root/.cloudflared/config.yml /root/.cloudflared/config.yaml /etc/cloudflared/config.yml \
             /etc/cloudflared/config.yaml /usr/local/etc/cloudflared/config.yml; do
      [[ -f $f ]] && { cfg=$f; break; }
    done
  fi
  if [[ -z $cfg || ! -r $cfg ]]; then
    TUNNEL_STATE=unknown; TUNNEL_NOTE="cloudflared is running, but its config file could not be found"
    return
  fi
  route=$(node "$CFTOOL" route --config "$cfg" --hostname "$DOMAIN" 2>/dev/null) \
    || { TUNNEL_STATE=unknown; TUNNEL_NOTE="could not read $cfg"; return; }
  local service; service=$(json_get "$route" 'j.service' || true)
  if [[ $(json_get "$route" 'j.found') != true ]] || [[ $service == http_status:* ]]; then
    TUNNEL_STATE=not-carried; TUNNEL_NOTE="cloudflared ($cfg) does not carry $DOMAIN"
  elif [[ $(json_get "$route" 'j.toNginx') == true ]]; then
    TUNNEL_STATE=here; TUNNEL_NOTE="cloudflared ($cfg) sends $DOMAIN to $service — this nginx"
  else
    TUNNEL_STATE=elsewhere; TUNNEL_NOTE="cloudflared ($cfg) sends $DOMAIN to $service, not to nginx on port 80"
  fi
  if ! systemctl is-active --quiet cloudflared 2>/dev/null && ! pgrep -x cloudflared >/dev/null 2>&1; then
    TUNNEL_NOTE+=" (but cloudflared is not running right now)"
  fi
}

# This machine's own addresses. A connection from one of them was made by a
# process running here (a remote host cannot complete a TCP handshake with a
# forged source address), so cloudflared counts as local whichever of them its
# service URL makes it use — /etc/hosts may well send it to the public IP.
LOCAL_ADDRS=(127.0.0.1 ::1)
load_local_addrs() {
  local a
  if command -v ip >/dev/null; then
    while read -r a; do [[ -n $a ]] && LOCAL_ADDRS+=("${a%%/*}"); done < <(ip -o addr show 2>/dev/null | awk '{ print $4 }')
  elif command -v hostname >/dev/null; then
    for a in $(hostname -I 2>/dev/null); do LOCAL_ADDRS+=("$a"); done
  fi
}
is_local_addr() { local a; [[ -n $1 ]] || return 1; for a in "${LOCAL_ADDRS[@]}"; do [[ $a == "$1" ]] && return 0; done; return 1; }

find_in_nginx_logs() {  # $1 = unique string -> the client address nginx logged with it
  local i line
  for ((i = 0; i < 10; i++)); do
    line=$(grep -rhF --include='*log' -- "$1" /var/log/nginx 2>/dev/null | tail -1 || true)
    if [[ -n $line ]]; then printf '%s\n' "${line%% *}"; return 0; fi
    sleep 0.3
  done
}

probe_public() {  # $1 = 1 to also find out which way the request came in
  local token; token=$(rand_token)
  local own=''
  if ! public_get "/?cloudpathway-probe=$token"; then
    is_local_addr "$PUB_ADDR" && own=", which is this server's own address rather than Cloudflare's"
    info "https://$DOMAIN/ gave no answer from here (${PUB_ERR:-no answer})${PUB_ADDR:+ — public DNS has $PUB_ADDR$own}"
    return 0
  fi
  BASE_CODE=$PUB_CODE
  info "https://$DOMAIN/ answers $PUB_CODE from the internet today${PUB_ADDR:+ (public DNS: $PUB_ADDR)}"
  [[ ${1:-0} -eq 1 ]] || return 0
  PROBE_FROM=$(find_in_nginx_logs "cloudpathway-probe=$token")
  if is_local_addr "$PROBE_FROM"; then
    ok "and that request reached this nginx from $PROBE_FROM, this machine's own address: through a tunnel on this machine"
  elif [[ -z $PROBE_FROM ]]; then
    info "that request does not appear in this server's nginx logs"
  else
    info "that request reached this nginx from $PROBE_FROM — directly, not through a tunnel"
  fi
}

decide_mode() {
  step "How visitors reach $DOMAIN"
  load_local_addrs
  detect_tunnel
  [[ -n $TUNNEL_NOTE ]] && info "$TUNNEL_NOTE"

  local tunnel=
  if [[ -n $FLAG_TUNNEL ]]; then
    tunnel=$FLAG_TUNNEL
    probe_public 0
  elif [[ -n $SAVED_MODE ]]; then
    [[ $SAVED_MODE == tunnel ]] && tunnel=1 || tunnel=0
    probe_public 0
  else
    case $TUNNEL_STATE in
      here) tunnel=1; probe_public 0 ;;
      none|not-carried) tunnel=0; probe_public 0 ;;
      elsewhere) probe_public 0 ;;
      unknown)
        probe_public 1
        is_local_addr "$PROBE_FROM" && tunnel=1 ;;
    esac
  fi

  if [[ $TUNNEL_STATE == elsewhere && $tunnel != 0 ]]; then
    die "$TUNNEL_NOTE. Visitors coming through that tunnel never reach nginx, so replacing the site in nginx would not change what they see. Point the tunnel's rule for $DOMAIN at http://127.0.0.1:80 (docs/deploy.md, \"Cloudflare tunnel\"), or re-run with --no-cloudflare-tunnel if $DOMAIN does not actually go through it. Nothing was changed."
  fi
  if [[ -z $tunnel ]]; then
    local msg="cloudflared is set up on this machine, and it cannot be told from this machine whether it carries $DOMAIN to nginx. Look in Zero Trust → Networks → Tunnels → (this tunnel) → Public Hostname: if $DOMAIN is there with service http://localhost:80 or http://127.0.0.1:80, re-run with --cloudflare-tunnel; if it is not there, re-run with --no-cloudflare-tunnel."
    if [[ $DRY_RUN -eq 1 ]]; then
      warn "$msg"
      warn "The real install will stop here and ask for one of those. This dry run shows the tunnel version."
      tunnel=1
    else
      die "$msg Nothing was changed."
    fi
  fi

  if [[ $tunnel == 1 ]]; then
    [[ $WANT_TLS -eq 1 ]] && die "--tls and a Cloudflare tunnel do not go together: cloudflared always speaks plain http to nginx, and HTTPS already ends at Cloudflare. Leave out --tls. Nothing was changed."
    nginx -V 2>&1 | grep -q -- '--with-http_realip_module' \
      || die "this nginx is built without the realip module, which the tunnel setup needs to see visitors' addresses (otherwise every visitor shares one rate limit). Nothing was changed."
    MODE=tunnel
    plan_set 'p.localAddresses = a;' "${LOCAL_ADDRS[@]}"
    ok "Cloudflare tunnel: nginx serves plain HTTP on port 80 for cloudflared; HTTPS stays at Cloudflare."
    info "No redirect to https in nginx (through a tunnel that is a loop), and visitors' addresses come from CF-Connecting-IP."
    if [[ $(plan_get 'j.oldServedHttps') == true ]]; then
      warn "the current site also serves HTTPS from this server directly; behind the tunnel nothing uses that, and the new site does not."
    fi
    local live=/etc/letsencrypt/live/$DOMAIN/fullchain.pem
    if [[ -f $live ]]; then
      info "certbot holds a certificate for $DOMAIN (renewal: $(cert_renewal "$live"), expires $(cert_end "$live")). Not used — Cloudflare does TLS."
    fi
    return 0
  fi

  if [[ $(plan_get 'j.oldServedHttps') == true ]]; then
    MODE=tls
    ok "HTTPS from this server, as the current site does, with its certificate"
  elif [[ $WANT_TLS -eq 1 ]]; then
    adopt_certbot_cert
    MODE=tls
    ok "HTTPS from this server (--tls), with certbot's certificate"
  else
    MODE=http
    ok "plain HTTP on port 80, as the current site does. (--tls would add HTTPS, with a certificate that renews itself.)"
  fi

  if [[ $MODE == tls ]]; then check_tls; fi
  if [[ $TUNNEL_STATE == none ]] && command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
    local svcs; svcs=$(firewall-cmd --list-services 2>/dev/null || true)
    [[ $svcs == *http* ]] || warn "firewalld does not list http/https as open — if the old site was reachable it may use ports; check \`sudo firewall-cmd --list-all\`"
  fi
}

adopt_certbot_cert() {
  local live=/etc/letsencrypt/live/$DOMAIN
  [[ -f $live/fullchain.pem && -f $live/privkey.pem ]] \
    || die "--tls: there is no certbot certificate for $DOMAIN in $live. Nothing was changed."
  case $(cert_renewal "$live/fullchain.pem") in
    manual) die "--tls: the certificate in $live was issued by hand (certbot --manual, DNS challenge) and cannot renew itself. It would expire on $(cert_end "$live/fullchain.pem") and take the site down with it. Nothing was changed — docs/deploy.md, \"TLS\"." ;;
    unknown) die "--tls: there is no renewal configuration for $live, so nothing would renew it. Nothing was changed." ;;
  esac
  openssl x509 -in "$live/fullchain.pem" -noout -checkend 86400 >/dev/null 2>&1 \
    || die "--tls: the certificate in $live has expired (or expires within a day). Nothing was changed."
  plan_set 'p.tls = { certs: [{ cert: a[0] + "/fullchain.pem", key: a[0] + "/privkey.pem" }], includesLeOptions: true, from: "certbot" }; p.aliasTls = null;' "$live"
}

check_tls() {
  local cert renewal end name aliases sans
  cert=$(plan_get 'j.tls.certs[0].cert')
  renewal=$(cert_renewal "$cert")
  end=$(cert_end "$cert")
  info "certificate: $cert${end:+ (valid until $end)}"
  case $renewal in
    auto) ok "certbot renews it automatically" ;;
    manual)
      HSTS=0
      warn "this certificate was issued by hand (certbot --manual) and cannot renew itself. The current site uses it, so the new one keeps it — without HSTS, so that when it expires visitors get a warning they can click through rather than a site they cannot open. Renew it before ${end:-it expires}." ;;
    unknown)
      HSTS=0
      info "it is not certbot-managed, so nothing here can tell whether it renews — HSTS is left off" ;;
  esac
  if command -v openssl >/dev/null && [[ -r $cert ]]; then
    openssl x509 -in "$cert" -noout -checkend 0 >/dev/null 2>&1 || warn "that certificate has EXPIRED"
    sans=$(openssl x509 -in "$cert" -noout -ext subjectAltName 2>/dev/null || true)
    aliases=$(plan_get 'j.aliasTls ? "" : j.aliases.join(" ")' || true)
    for name in "$DOMAIN" $aliases; do
      [[ $sans == *"DNS:$name"* ]] || warn "the certificate does not cover $name — browsers will warn on https://$name"
    done
  fi

  # Renewals by webroot must keep being answered once the site is proxied.
  local certname renew webroot
  if [[ $(plan_get 'j.acmeRoot' || echo null) == null && $cert == /etc/letsencrypt/live/*/* ]]; then
    certname=${cert#/etc/letsencrypt/live/}; certname=${certname%%/*}
    renew=/etc/letsencrypt/renewal/$certname.conf
    if [[ -f $renew ]] && grep -Eq '^\s*authenticator\s*=\s*webroot' "$renew"; then
      webroot=$(sed -nE "s/^\s*(${DOMAIN//./\\.}|webroot_path)\s*=\s*([^,]+),?\s*$/\2/p" "$renew" | head -1)
      if [[ -n $webroot ]]; then
        plan_set 'p.acmeRoot = a[0];' "$webroot"
        info "certbot renews by webroot ($webroot) — the challenge path will keep being served from there"
      fi
    fi
  fi
}

# Would this site become nginx's default server for a socket where some other
# site answers by default today? That decides who gets requests by IP address
# (phones provisioning by IP, scanners), without SNI, or for unknown names.
check_default_impact() {
  local ports=(80) p k hit where listen msgs=()
  [[ $MODE == tls ]] && ports+=(443)
  for p in "${ports[@]}"; do
    for k in "$p" "${p}v6"; do
      if [[ $k == *v6 ]]; then
        [[ $(plan_get "j.ipv6['$p']") == true ]] || continue
        where="port $p over IPv6"; listen="listen [::]:$p default_server;"
      else
        where="port $p"; listen="listen $p default_server;"
      fi
      hit=$(plan_get "(i => i ? i.file + ':' + i.line + ' (' + (i.names.join(' ') || 'no server_name') + ')' : null)(j.defaultImpact['$k'])" || true)
      [[ -n $hit ]] || continue
      local what="requests by IP address (phones provisioning by IP, for one) and for names no block claims"
      [[ $p == 443 ]] && what="requests by IP address, without SNI, and for names no block claims"
      msgs+=("$where: nginx's default server there today is $hit. This site's file would sort ahead of it and take over what the default answers — $what. Make that block's listen explicit, \`$listen\`, run \`sudo nginx -t && sudo systemctl reload nginx\`, then re-run.")
    done
  done
  if ((${#msgs[@]})); then
    printf '\n'; printf '    %s\n' "${msgs[@]}"
    die "nothing was changed."
  fi
}

render_nginx() {  # -> stdout
  local le='' kind f stored cert replaced=() extra=()
  if [[ $MODE == tls ]]; then
    cert=$(plan_get 'j.tls.certs[0].cert')
    if [[ $cert == /etc/letsencrypt/* && -f /etc/letsencrypt/options-ssl-nginx.conf ]]; then le=/etc/letsencrypt/options-ssl-nginx.conf; fi
  fi
  if [[ -f $TAKEOVER ]]; then
    while IFS=$'\t' read -r kind f stored; do [[ -n $f && $kind != created ]] && replaced+=(--replaced "$f"); done <"$TAKEOVER"
  fi
  while read -r f; do [[ -n $f ]] && replaced+=(--replaced "$f"); done \
    < <(plan_get 'j.toDisable.map(d => d.path).join("\n")' || true)
  [[ $HSTS -eq 1 ]] || extra+=(--no-hsts)
  node "$PLANNER" render --plan "$PLAN_FILE" --port "$PORT" --nginx-version "$NGINX_VERSION" --mode "$MODE" \
    ${le:+--le-options "$le"} "${replaced[@]}" "${extra[@]}"
}

# ------------------------------------------------------------------ the app
ensure_account() {
  step "Service accounts and directories"
  local nologin; nologin=$(command -v nologin || echo /sbin/nologin)
  if ! id -u "$SVC_USER" >/dev/null 2>&1; then
    useradd --system --user-group --home-dir "$BASE" --no-create-home --shell "$nologin" "$SVC_USER"
    ok "created system user $SVC_USER (runs the site)"
  fi
  # The build runs npm packages' install scripts and the app's build. As a user
  # of its own it cannot read the running site's environment (the Telnyx key)
  # or its database, and what it builds is handed to root before it is run.
  if ! id -u "$BUILD_USER" >/dev/null 2>&1; then
    useradd --system --user-group --home-dir "$BASE/.build-home" --no-create-home --shell "$nologin" "$BUILD_USER"
    ok "created system user $BUILD_USER (builds releases)"
  fi
  install -d -m 755 -o root -g root "$BASE" "$BASE/releases"
  chown root:root "$BASE" "$BASE/releases"; chmod 755 "$BASE" "$BASE/releases"
  install -d -m 700 -o "$BUILD_USER" -g "$BUILD_USER" "$BASE/.npm" "$BASE/.build-home"
  chown -R -h "$BUILD_USER:$BUILD_USER" "$BASE/.npm" "$BASE/.build-home"
  install -d -m 750 -o "$SVC_USER" -g "$SVC_USER" "$BASE/data"
  install -d -m 700 -o root -g root "$BASE/backups"
  install -d -m 755 -o root -g root "$ETC"
  install -d -m 700 -o root -g root "$STATE"
  # Releases made by an earlier version of this installer belonged to the
  # service account; the site must not be able to rewrite its own code.
  find "$BASE/releases" -mindepth 1 -maxdepth 1 -name '[0-9]*' ! -user root -exec chown -R -h root:root {} + 2>/dev/null || true
  ok "$BASE (code: root; data: $SVC_USER; builds: $BUILD_USER)"
}

clean_leftovers() {
  # From a run that was killed (or lost power) before it could clean up.
  local d
  while read -r d; do [[ -n $d ]] && rm -rf -- "$d" && info "removed an unfinished build: $(basename "$d")"; done \
    < <(find "$BASE/releases" -mindepth 1 -maxdepth 1 -type d -name '.building-*' 2>/dev/null)
  rm -f -- "$NGINX_STAGED"
  local cur; cur=$(current_release)
  if [[ -f $IN_PROGRESS ]]; then
    warn "a previous run ($(cat "$IN_PROGRESS")) was stopped in the middle of a switch, before it could check or undo it."
    warn "This run starts from what is on disk now and goes through every step and check again."
    # The site may be down now. Bring back the newest release known to work
    # before anything else, rather than after a build.
    if [[ -z $(json_get "$(health_json)" 'j.ok || null' || true) ]]; then
      local good=; [[ -n $cur && -e $cur/.served ]] && good=$cur
      [[ -n $good ]] || good=$(served_releases_newest_first | head -1)
      if [[ -n $good ]]; then
        info "the app is not answering — starting $(basename "$good") first"
        if restart_release "$good"; then ok "$(basename "$good") is serving again"; else warn "it did not come up — see journalctl -u $APP"; fi
        cur=$(current_release)
      fi
    fi
    rm -f -- "$IN_PROGRESS"
  fi
  # A release that served under an earlier version of this installer has no marker.
  if [[ -n $cur && -d $cur && ! -e $cur/.served ]] && [[ $(json_get "$(health_json)" 'j.release' || true) == "$(basename "$cur")" ]]; then
    touch -- "$cur/.served"
  fi
  return 0
}

NEW_ID= ; NEW_DIR=
build_release() {
  local sha; sha=$(git_repo rev-parse HEAD)
  NEW_ID=$STAMP-${sha:0:12}
  NEW_DIR=$BASE/releases/$NEW_ID
  BUILD_DIR=$BASE/releases/.building-$NEW_ID
  step "Building release $NEW_ID (the current site keeps serving meanwhile)"

  install -d -m 755 -o "$BUILD_USER" -g "$BUILD_USER" "$BUILD_DIR"
  # Exactly the commit — no node_modules, .next, data or stray files from the checkout.
  git_repo archive --format=tar HEAD | (cd / && runuser -u "$BUILD_USER" -- tar -x --no-same-owner -C "$BUILD_DIR")

  local passthru=() v
  for v in http_proxy https_proxy HTTP_PROXY HTTPS_PROXY no_proxy NO_PROXY NODE_EXTRA_CA_CERTS npm_config_registry; do
    [[ -n ${!v:-} ]] && passthru+=("$v=${!v}")
  done
  # npm ci with dev dependencies (the build needs TypeScript, Tailwind), build,
  # then prune them. The pruned tree is what runs; next.config.mjs is plain JS
  # precisely so that `next start` needs nothing that was pruned.
  #
  # In a session of its own, waited for in the background: a dropped SSH
  # connection cannot kill it halfway (it never sees the hangup), and a Ctrl-C
  # stops this script at once — npm can swallow an interrupt and exit 0 —
  # after which on_exit stops the build account's processes and deletes the
  # unfinished build.
  (cd "$BUILD_DIR" && exec setsid runuser -u "$BUILD_USER" -- env -i \
        PATH="$(dirname "$NODE_BIN"):/usr/local/bin:/usr/bin:/bin" HOME="$BASE/.build-home" \
        npm_config_cache="$BASE/.npm" npm_config_update_notifier=false npm_config_fund=false \
        NEXT_TELEMETRY_DISABLED=1 "${passthru[@]}" \
        bash -c 'set -e; npm ci --no-audit; npm run build; npm prune --omit=dev --no-audit' 9>&-) &
  BUILD_PID=$!
  if ! wait "$BUILD_PID"; then
    BUILD_PID=
    die "the build failed — nothing was switched; the current site is untouched. Output is above and in $LOG."
  fi
  BUILD_PID=
  [[ -f $BUILD_DIR/.next/BUILD_ID ]] || die "the build finished without producing .next/BUILD_ID — nothing was switched; the current site is untouched."

  # From here the release belongs to root: the build account can no longer
  # change it, and neither can the site that runs it.
  chown -R -h root:root "$BUILD_DIR"
  chmod -R go-w "$BUILD_DIR"
  printf '%s\n' "$NEW_ID" >"$BUILD_DIR/.release"

  # The native SQLite module is the part most likely to be wrong on a new Node
  # or npm. Loaded as the account that will run it.
  if ! (cd "$BUILD_DIR" && runuser -u "$SVC_USER" -- "$NODE_BIN" -e \
        'const D=require("better-sqlite3"); new D(":memory:").prepare("select 1").get();' 9>&-) ; then
    local bv; bv=$(node -p 'require(process.argv[1]).version' "$BUILD_DIR/node_modules/better-sqlite3/package.json" 2>/dev/null || echo '?')
    die "better-sqlite3 $bv does not load under node $(node -v). The usual cause on npm 11 or newer: its install script was not allowed to run — npm only runs the ones package.json's \"allowScripts\" names, by exact version, and it must name better-sqlite3@$bv (in a development checkout: \`npm approve-scripts better-sqlite3\`, commit, pull here). If the script did run, it needed gcc-c++, make and python3 to compile. The current site is untouched."
  fi

  mv -T -- "$BUILD_DIR" "$NEW_DIR"
  BUILD_DIR=
  ok "built and verified: $NEW_DIR"
}

install_env() {
  step "Settings ($ENV_FILE)"
  if [[ ! -f $ENV_FILE ]]; then
    install -m 600 -o root -g root "$SCRIPT_DIR/env.example" "$ENV_FILE"
    ok "created from deploy/env.example"
  else
    chmod 600 "$ENV_FILE"; chown root:root "$ENV_FILE"
    ok "exists — left as it is"
  fi
  if [[ -n $IMPORT_PS ]]; then
    [[ -r $IMPORT_PS ]] || die "--import-phonesystem-env: cannot read $IMPORT_PS"
    info "importing blanks from $IMPORT_PS:"
    node "$ENVTOOL" import-phonesystem --from "$IMPORT_PS" --to "$ENV_FILE"
  fi
  node "$ENVTOOL" check --env "$ENV_FILE"
}

install_unit() {
  step "systemd unit"
  local tmp; tmp=$(mktemp)
  sed -e "s#@@USER@@#$SVC_USER#g" -e "s#@@BASE@@#$BASE#g" -e "s#@@ENV_FILE@@#$ENV_FILE#g" \
      -e "s#@@NODE@@#$NODE_BIN#g" -e "s#@@PORT@@#$PORT#g" \
      "$SCRIPT_DIR/templates/$APP.service" >"$tmp"
  if [[ -f $UNIT ]] && cmp -s "$tmp" "$UNIT"; then
    rm -f "$tmp"; ok "unchanged"
  else
    if [[ -f $UNIT ]]; then UNIT_BACKUP=$STATE/$APP.service.before-$STAMP; cp -p -- "$UNIT" "$UNIT_BACKUP"; fi
    install -m 644 -o root -g root "$tmp" "$UNIT"; rm -f "$tmp"
    command -v restorecon >/dev/null && restorecon -F "$UNIT" 2>/dev/null || true
    systemctl daemon-reload
    ok "installed $UNIT"
  fi
  systemctl enable "$APP" >/dev/null 2>&1 || warn "could not enable $APP at boot (systemctl enable $APP)"
}

restore_unit() {  # after a failed switch: the previous release goes back with the unit it ran under
  [[ -n $UNIT_BACKUP && -f $UNIT_BACKUP ]] || return 0
  install -m 644 -o root -g root "$UNIT_BACKUP" "$UNIT"
  command -v restorecon >/dev/null && restorecon -F "$UNIT" 2>/dev/null || true
  systemctl daemon-reload || true
  info "put the previous systemd unit back"
  UNIT_BACKUP=
}

backup_db() {  # $1 = release id being switched to. The service must be stopped.
  local db=$BASE/data/cloudpathway.db dest=$BASE/backups/$STAMP-to-$1 f
  [[ -f $db ]] || return 0
  install -d -m 700 "$dest" || return 1
  for f in "$db" "$db-wal" "$db-shm"; do
    [[ -f $f ]] || continue
    cp -a -- "$f" "$dest/" || return 1
    cmp -s -- "$f" "$dest/$(basename "$f")" || return 1
  done
  info "database copied to $dest (and compared)"
  # keep the newest $KEEP_DB_BACKUPS (named by time first, so name order is time order)
  find "$BASE/backups" -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n +$((KEEP_DB_BACKUPS + 1)) | xargs -r rm -rf -- || true
}

point_current_at() { ln -sfn -- "$1" "$BASE/current.next" && mv -Tf -- "$BASE/current.next" "$BASE/current"; }

restart_release() {  # $1 = release dir. Makes it current, starts it, waits for it.
  local rel=$1
  [[ -n $rel && -d $rel ]] || return 1
  systemctl stop "$APP" >/dev/null 2>&1 || true
  point_current_at "$rel" || return 1
  systemctl reset-failed "$APP" >/dev/null 2>&1 || true
  systemctl start "$APP" || true
  wait_healthy "$(basename "$rel")"
}

switch_to() {  # $1 = release dir. Succeeds only if that release comes up healthy.
  local dir=$1 id prev
  id=$(basename "$dir"); prev=$(current_release)
  step "Switching the app to $id"
  info "(until the switch has been checked, Ctrl-C is ignored: stopping halfway could leave the site down)"
  SWITCH_PREV=${prev:--}
  if systemctl is-active --quiet "$APP" && ! systemctl stop "$APP"; then
    warn "could not stop $APP for the switch"
    # It may have stopped anyway; whatever happened, the release that was
    # serving must be serving again before this gives up.
    if [[ -n $prev ]] && ! wait_healthy_once "$(basename "$prev")"; then
      restart_release "$prev" && ok "$(basename "$prev") is serving" || warn "$(basename "$prev") did not come back — see journalctl -u $APP"
    fi
    SWITCH_PREV=
    return 1
  fi
  if ! backup_db "$id"; then
    warn "copying the database before the switch failed — not switching"
    [[ -n $prev ]] && { restart_release "$prev" || warn "and $(basename "$prev") did not come back — see journalctl -u $APP"; }
    SWITCH_PREV=
    return 1
  fi
  if ! point_current_at "$dir"; then
    warn "could not point $BASE/current at $id"
    [[ -n $prev ]] && { restart_release "$prev" || true; }
    SWITCH_PREV=
    return 1
  fi
  systemctl reset-failed "$APP" >/dev/null 2>&1 || true
  systemctl start "$APP" || true   # judged by the health check below, not by systemctl
  if wait_healthy "$id"; then
    touch -- "$dir/.served" || true
    SWITCH_PREV=
    ok "$id is serving on 127.0.0.1:$PORT"
    return 0
  fi
  warn "$id did not become healthy. Last service log lines:"
  journalctl -u "$APP" -n 30 --no-pager 2>/dev/null | sed 's/^/      /' || true
  restore_unit
  if [[ -n $prev && -d $prev && $prev != "$dir" ]]; then
    warn "putting $(basename "$prev") back"
    if restart_release "$prev"; then ok "$(basename "$prev") is serving again"
    else warn "the previous release did not come back either — see journalctl -u $APP"; fi
  else
    systemctl stop "$APP" >/dev/null 2>&1 || true   # nothing to go back to; do not leave it crash-looping
  fi
  # A release that never served is not worth a kept slot or a rollback; one
  # that has served before (a rollback target) is never deleted here.
  if [[ ! -e $dir/.served && $dir != "$(current_release)" ]]; then
    rm -rf -- "$dir"
    info "removed $id, which never served (its log is in journalctl -u $APP)"
  fi
  SWITCH_PREV=
  return 1
}

prune_releases() {
  local cur d kept=0
  cur=$(current_release)
  while read -r d; do
    [[ -z $d || $d == "$cur" ]] && continue
    if [[ -e $d/.served ]] && ((kept < KEEP_RELEASES - 1)); then kept=$((kept + 1)); continue; fi
    rm -rf -- "$d" && info "removed old release $(basename "$d")"
  done < <(releases_newest_first)
  return 0
}

# ------------------------------------------------------------------ nginx
# Undo log for this run's nginx changes: "op<TAB>a<TAB>b" entries replayed in
# reverse by run_ops. Typed operations rather than eval'd strings, so a path
# can never be interpreted as shell.
undo_op() { local IFS=$'\t'; NGINX_UNDO+=("$*"); }
run_ops() {  # replay an array of ops (passed by name) in reverse
  local -n _ops=$1
  local i op a b
  for ((i = ${#_ops[@]} - 1; i >= 0; i--)); do
    IFS=$'\t' read -r op a b <<<"${_ops[i]}"
    case $op in
      mv) mv -f -- "$a" "$b" || true ;;
      cp) cp -a -- "$a" "$b" || true ;;
      rm) rm -f -- "$a" || true ;;
      symlink) ln -sfn -- "$a" "$b" || true ;;
    esac
  done
  _ops=()
}

undo_nginx() {
  [[ ${#NGINX_UNDO[@]} -gt 0 ]] || return 0
  run_ops NGINX_UNDO
  if nginx -t >/dev/null 2>&1; then systemctl reload nginx || true
  else warn "after putting the files back, \`nginx -t\` still fails — run it and look (sudo nginx -t)"; fi
}

# A reload is asynchronous: for a moment the old workers keep answering (and
# keep-alive connections, cloudflared's included, stay on them). After handing
# the domain back, wait until it has actually stopped answering as this app.
wait_handed_back() {
  local scheme=http port=80 i
  [[ $MODE == tls ]] && scheme=https port=443
  for ((i = 0; i < 30; i++)); do
    [[ $(local_get "$scheme" "$DOMAIN" "$port" 127.0.0.1 /api/health) == '{"ok":true}' ]] || return 0
    sleep 0.5
  done
  return 1
}

fail_nginx() { warn "putting nginx back the way it was"; undo_nginx; die "$1"; }

emergency_undo() {
  if [[ ${#NGINX_UNDO[@]} -gt 0 ]]; then undo_nginx; warn "nginx put back the way it was"; fi
  if [[ -n $SWITCH_PREV ]]; then
    restore_unit || true
    if [[ $SWITCH_PREV != - ]]; then
      restart_release "$SWITCH_PREV" && warn "app back on $(basename "$SWITCH_PREV")" || warn "the app is not running — see journalctl -u $APP"
    else
      systemctl stop "$APP" >/dev/null 2>&1 || true
    fi
    SWITCH_PREV=
  fi
}

selinux_allow_proxy() {
  command -v getenforce >/dev/null || return 0
  [[ $(getenforce) == Disabled ]] && return 0
  if [[ $(getsebool httpd_can_network_connect 2>/dev/null) != *"--> on" ]]; then
    info "setsebool -P httpd_can_network_connect 1 (persistent; can take a few seconds)"
    setsebool -P httpd_can_network_connect 1
  fi
}

record_takeover() {  # kind path stored — once per path
  if [[ -f $TAKEOVER ]] && awk -F'\t' -v p="$2" '$2 == p { f = 1 } END { exit !f }' "$TAKEOVER"; then return 0; fi
  printf '%s\t%s\t%s\n' "$1" "$2" "$3" >>"$TAKEOVER"
}

disable_old_site() {  # from the plan's toDisable list
  local backup=$1 kind path stored
  while IFS=$'\t' read -r kind path; do
    [[ -z $path ]] && continue
    cp -a -- "$path" "$backup/" 2>/dev/null || cp -aL -- "$path" "$backup/" || fail_nginx "could not copy $path to $backup"
    case $kind in
      confd)
        stored=$path.cloudpathway-disabled
        mv -- "$path" "$stored" || fail_nginx "could not rename $path"
        undo_op mv "$stored" "$path" ;;
      sites-enabled)
        if [[ -L $path ]]; then
          stored=$(readlink -f "$path"); rm -f -- "$path" || fail_nginx "could not remove the link $path"
          kind='symlink'
          undo_op symlink "$stored" "$path"
        else
          install -d -m 700 "$STATE/displaced"
          stored=$STATE/displaced/$(basename "$path").$STAMP
          mv -- "$path" "$stored" || fail_nginx "could not move $path"
          kind='file'
          undo_op mv "$stored" "$path"
        fi ;;
      *) fail_nginx "internal: unknown takeover kind $kind" ;;
    esac
    record_takeover "$kind" "$path" "$stored"
    ok "disabled $path (copy in $backup)"
  done < <(plan_get 'j.toDisable.map(d => d.kind + "\t" + d.path).join("\n")' || true)
}

configure_nginx() {
  step "nginx"
  local rendered n_dis backup=$STATE/nginx-backup-$STAMP
  rendered=$(mktemp)
  render_nginx >"$rendered"
  n_dis=$(plan_get 'j.toDisable.length')

  if [[ -f $NGINX_CONF ]] && cmp -s "$rendered" "$NGINX_CONF" && [[ $n_dis == 0 ]]; then
    rm -f "$rendered"; ok "$NGINX_CONF is already up to date"
  else
    # The takeover record is part of what gets put back.
    install -d -m 700 "$backup"
    if [[ -f $TAKEOVER ]]; then cp -a -- "$TAKEOVER" "$backup/takeover.tsv"; undo_op cp "$backup/takeover.tsv" "$TAKEOVER"
    else undo_op rm "$TAKEOVER"; fi
    # Written inside conf.d (as a name nginx does not include) and renamed into
    # place: a file created elsewhere and moved here would carry the wrong
    # SELinux label, and nginx would be denied reading its own config.
    install -m 644 -o root -g root "$rendered" "$NGINX_STAGED"; rm -f "$rendered"
    undo_op rm "$NGINX_STAGED"
    if [[ -f $NGINX_CONF ]]; then
      cp -a -- "$NGINX_CONF" "$backup/$APP.conf.before"
      undo_op cp "$backup/$APP.conf.before" "$NGINX_CONF"
    else
      undo_op rm "$NGINX_CONF"
    fi
    disable_old_site "$backup"
    # Nothing served the domain before: restore-old-site removes this site's
    # file, and that is the whole of the undo.
    if [[ $(plan_get 'j.source') == none ]]; then record_takeover created "$NGINX_CONF" -; fi
    mv -f -- "$NGINX_STAGED" "$NGINX_CONF" || fail_nginx "could not move the new configuration into place"
    command -v restorecon >/dev/null && restorecon -F "$NGINX_CONF" 2>/dev/null || true
  fi

  local test_out
  if ! test_out=$(nginx -t 2>&1); then
    printf '%s\n' "$test_out" | sed 's/^/      /'
    fail_nginx "the new nginx configuration did not pass \`nginx -t\` (above). Everything was put back; the old site is still serving."
  fi
  selinux_allow_proxy || fail_nginx "could not allow nginx to connect to the app (setsebool httpd_can_network_connect)"
  # Always, even when the file did not change: an earlier run may have been
  # stopped between writing it and reloading.
  systemctl reload nginx || fail_nginx "nginx did not reload"
  ok "nginx reloaded with $NGINX_CONF"
}

verify_site() {
  case $MODE in
    tunnel) step "Checking the site through nginx, the way cloudflared reaches it" ;;
    *) step "Checking the site through nginx, as a visitor reaches it" ;;
  esac
  local scheme port host body code i
  if [[ $MODE == tls ]]; then scheme=https port=443; else scheme=http port=80; fi
  host=$(plan_get "j.listenHosts['$port'][0] || ''" || true)
  [[ -z $host || $host == "["* ]] && host=127.0.0.1

  for ((i = 0; i < 10; i++)); do
    body=$(local_get "$scheme" "$DOMAIN" "$port" "$host" /api/health)
    [[ $body == '{"ok":true}' ]] && break
    sleep 1
  done
  if [[ $body != '{"ok":true}' ]]; then
    code=$(local_get "$scheme" "$DOMAIN" "$port" "$host" /api/health -o /dev/null -w '%{http_code}')
    warn "$scheme://$DOMAIN/api/health on this server answered ${code:-nothing}: ${body:0:200}"
    [[ $body == *'"release"'* ]] && warn "the detailed health view came back through nginx: X-Real-IP is not reaching the app"
    if [[ $code == 502 ]] && command -v ausearch >/dev/null; then
      warn "502 with the app healthy is almost always SELinux; recent denials:"
      ausearch -m AVC -ts recent 2>/dev/null | grep -i nginx | tail -3 | sed 's/^/      /' || true
    fi
    return 1
  fi
  ok "$scheme://$DOMAIN/ on this server is the new site"

  local loc want a
  if [[ $MODE == tls ]]; then
    loc=$(local_get http "$DOMAIN" 80 "$host" / -o /dev/null -w '%{http_code} %{redirect_url}')
    [[ $loc == "301 https://$DOMAIN/" ]] && ok "http:// redirects to https://" || warn "http://$DOMAIN/ answered: $loc"
  fi
  for a in "${ALIASES[@]}"; do
    [[ -n $a ]] || continue
    case $MODE in tls|tunnel) want="301 https://$DOMAIN/" ;; *) want="301 http://$DOMAIN/" ;; esac
    loc=$(local_get "$scheme" "$a" "$port" "$host" / -o /dev/null -w '%{http_code} %{redirect_url}')
    [[ $loc == "$want" ]] && ok "$a redirects to $DOMAIN" || warn "$scheme://$a/ answered \"$loc\", expected \"$want\""
  done

  if [[ $MODE == tunnel ]]; then
    local token ip line
    token=$(rand_token); ip=192.0.2.$((RANDOM % 200 + 20))
    local_get http "$DOMAIN" 80 "$host" "/api/health?cloudpathway-realip=$token" -o /dev/null -H "CF-Connecting-IP: $ip" >/dev/null
    for ((i = 0; i < 10; i++)); do
      line=$(grep -F "cloudpathway-realip=$token" "$SITE_ACCESS_LOG" 2>/dev/null | tail -1 || true)
      [[ -n $line ]] && break
      sleep 0.2
    done
    if [[ ${line%% *} == "$ip" ]]; then ok "visitors' addresses come through from cloudflared (CF-Connecting-IP)"
    elif [[ -n $line ]]; then warn "nginx logged ${line%% *} instead of the address in CF-Connecting-IP — all visitors would share one rate limit"
    else warn "could not find the test request in $SITE_ACCESS_LOG to check visitors' addresses"; fi
  fi
  return 0
}

verify_public() {
  step "Checking https://$DOMAIN/ from the internet's side"
  local token i; token=$(rand_token)
  for ((i = 0; i < 6; i++)); do
    if public_get "/api/health?cloudpathway-check=$token$i"; then
      if [[ $PUB_BODY == '{"ok":true}' ]]; then ok "https://$DOMAIN/ is the new site, as visitors see it"; return 0; fi
      [[ $PUB_CODE == 3* ]] && break
    elif [[ -z $PUB_ADDR && -z ${CPW_TEST_PUBLIC_RESOLVE:-} ]]; then
      break   # the name cannot be looked up from here at all
    fi
    sleep 2
  done
  if [[ $PUB_CODE == 3* ]]; then
    warn "https://$DOMAIN/api/health answered $PUB_CODE, a redirect — behind Cloudflare that is a redirect loop"
    return 1
  fi
  if [[ -n $PUB_CODE ]]; then
    warn "from the internet, https://$DOMAIN/api/health answered $PUB_CODE: $(printf '%s' "${PUB_BODY:0:160}" | tr -cd '[:print:]')"
    if [[ $MODE == tunnel ]]; then
      warn "On this server the new site answers for $DOMAIN, so the tunnel is delivering the request somewhere else or under another name. In Zero Trust → Networks → Tunnels → (this tunnel) → Public Hostname → $DOMAIN: the service should be http://localhost:80, and Additional application settings → HTTP Settings → HTTP Host Header should be empty."
    fi
  fi
  if [[ $BASE_CODE == [23]* ]]; then
    warn "before the switch https://$DOMAIN/ answered $BASE_CODE, so visitors are not getting the new site"
    return 1
  fi
  if [[ -z $PUB_CODE ]]; then
    info "could not check from the internet's side (${PUB_ERR:-no answer}) — open https://$DOMAIN/ in a browser"
  else
    warn "it did not answer from the internet before the switch either, so this is not treated as a failure — open https://$DOMAIN/ in a browser"
  fi
  return 0
}

# ------------------------------------------------------------------ commands
cmd_install() {
  need_root
  load_deploy_conf
  if [[ $CMD == update && -z $SAVED_DOMAIN ]]; then die "nothing installed yet — use: $ME install --domain info.cloudpathway.org"; fi
  if [[ -n $DOMAIN && -n $SAVED_DOMAIN && ${DOMAIN,,} != "$SAVED_DOMAIN" ]]; then
    die "this server's site is installed for $SAVED_DOMAIN. Moving it to ${DOMAIN,,} is not something update can do safely: run \`$ME restore-old-site\` first, remove $DEPLOY_CONF, then install for the new name."
  fi
  if [[ -n $PORT && -n $SAVED_PORT && $PORT != "$SAVED_PORT" ]]; then
    die "the app is installed on port $SAVED_PORT; changing it on an installed site is not supported (leave out --port)"
  fi
  use_saved
  MODE=
  [[ -n $DOMAIN ]] || die "--domain is required, e.g. --domain info.cloudpathway.org"
  DOMAIN=${DOMAIN,,}
  [[ $DOMAIN =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || die "\"$DOMAIN\" is not a hostname"
  [[ $PORT =~ ^[0-9]+$ && $PORT -ge 1024 && $PORT -le 65535 ]] || die "--port must be 1024-65535"

  if [[ $DRY_RUN -eq 1 ]]; then
    preflight
    make_plan
    decide_mode
    check_default_impact
    step "nginx configuration that would be written to $NGINX_CONF"
    render_nginx | sed 's/^/    | /'
    step "Dry run — nothing was changed"
    return 0
  fi

  take_lock
  start_log "--domain $DOMAIN --port $PORT"
  [[ -d $STATE ]] && clean_leftovers
  preflight
  make_plan
  decide_mode
  check_default_impact

  case $(plan_get 'j.source') in
    existing-site)
      printf '\n    %sThis replaces the site currently live at %s.%s\n' "$B" "$DOMAIN" "$N"
      info "The files above are disabled, not deleted, and copied to $STATE first."
      info "\`$ME restore-old-site\` puts them back in seconds."
      confirm replace ;;
    none)
      printf '\n    %sThis adds %s to nginx, which answers it with its default server today.%s\n' "$B" "$DOMAIN" "$N"
      info "\`$ME restore-old-site\` removes it again."
      confirm add ;;
  esac

  local planned_aliases
  planned_aliases=$(plan_get 'j.aliases.join(" ")' || true)
  read -r -a ALIASES <<<"$planned_aliases"

  ensure_account
  clean_leftovers
  build_release
  install_env
  install_unit

  local prev; prev=$(current_release)
  enter_critical "switching to $NEW_ID"
  if ! switch_to "$NEW_DIR"; then
    leave_critical
    die "the switch to the new release did not complete (above). nginx was not touched — the site visitors see has not changed."
  fi

  configure_nginx
  if ! verify_site || ! verify_public; then
    rm -f -- "$NEW_DIR/.served"   # it answered, but not as a working site: not a rollback target
    if [[ ${#NGINX_UNDO[@]} -gt 0 ]]; then
      warn "putting nginx back the way it was"
      undo_nginx
      if [[ $(plan_get 'j.source') != previous-install ]] && ! wait_handed_back; then
        warn "$DOMAIN still answers as the new site 15 s after nginx was put back — check \`sudo nginx -T\`"
      fi
    fi
    if [[ -n $prev && -d $prev && $prev != "$NEW_DIR" ]]; then
      warn "putting $(basename "$prev") back"
      restore_unit
      if restart_release "$prev"; then ok "$(basename "$prev") is serving again"
      else warn "$(basename "$prev") did not come back — see journalctl -u $APP"; fi
      leave_critical
      die "the new release did not work as a site (above), so this run's changes were put back — visitors see what they saw before."
    fi
    leave_critical
    die "the new site did not answer as it should (above), so nginx was put back — visitors see what they saw before. The new app is still running on 127.0.0.1:$PORT, out of nginx's way."
  fi
  NGINX_UNDO=()
  save_deploy_conf
  SWITCHED=1
  leave_critical

  prune_releases
  step "Done — $DOMAIN is serving release $NEW_ID"
  info "status:   $ME status"
  info "settings: sudo vi $ENV_FILE && sudo systemctl restart $APP"
  info "mail:     $ME test-mail --to you@example.com"
  info "update:   git pull && $ME update"
  info "undo:     $ME rollback   |   $ME restore-old-site"
  if [[ -n $EXPOSED ]]; then
    # Look again at nginx as it is now: the block that served the checkout may
    # just have been switched off, but another (nginx.conf's stock server,
    # root /usr/share/nginx/html) can still reach it.
    EXPOSED=
    if nginx -T 2>/dev/null | node "$PLANNER" plan --domain "$DOMAIN" --own-file "$NGINX_CONF" >"$PLAN_FILE" 2>/dev/null; then
      check_checkout_exposure
    fi
    if [[ -n $EXPOSED ]]; then
      warn "reminder: move this checkout out of the web root now — docs/deploy.md, \"Where the checkout lives\"."
    else
      ok "no nginx block serves this checkout any more; still, keep checkouts out of web roots (docs/deploy.md, \"Where the checkout lives\")"
    fi
  fi
}

cmd_rollback() {
  need_root; load_deploy_conf; use_saved
  take_lock; start_log
  [[ -d $STATE ]] && clean_leftovers
  NODE_BIN=$(readlink -f "$(type -P node)")
  local cur prev
  cur=$(current_release)
  [[ -n $cur ]] || die "nothing is deployed"
  # The newest release OLDER than the live one that has served before — so
  # rolling back twice goes further back, and never onto a build that failed.
  prev=$(served_releases_newest_first | awk -v cur="$cur" '$0 < cur' | head -1 || true)
  [[ -n $prev ]] || die "there is no earlier release on disk that has served before"
  info "current:  $(basename "$cur")"
  info "rollback: $(basename "$prev")"
  info "The database is left as it is (its schema only ever gains columns). Copies are in $BASE/backups/."
  confirm rollback
  enter_critical "rolling back to $(basename "$prev")"
  if ! switch_to "$prev"; then
    leave_critical
    die "rollback failed — see above"
  fi
  SWITCHED=1
  leave_critical
  step "Rolled back to $(basename "$prev")"
}

cmd_restore_old_site() {
  need_root; load_deploy_conf; use_saved
  [[ -f $TAKEOVER && -s $TAKEOVER ]] || die "there is no record of a site this installer replaced (nothing in $TAKEOVER)"
  take_lock; start_log
  step "Handing ${DOMAIN:-the domain} back to the previous configuration"
  local kind path stored todo=() l
  # Each entry is either still disabled, or already back (a restore that was
  # stopped halfway): this can be run again until it completes.
  while IFS=$'\t' read -r kind path stored; do
    [[ -n $path ]] || continue
    case $kind in
      created) info "remove $NGINX_CONF (nothing served $DOMAIN before it)" ;;
      confd|file)
        if [[ -e $stored && ! -e $path ]]; then info "re-enable $path"; todo+=("$kind"$'\t'"$path"$'\t'"$stored")
        elif [[ ! -e $stored && -e $path ]]; then info "$path is back already"
        elif [[ -e $stored && -e $path ]]; then die "both $path and its disabled copy $stored exist — decide which to keep, by hand"
        else die "$stored (the disabled copy of $path) is missing — restore it from $STATE/nginx-backup-*/ by hand"; fi ;;
      symlink)
        if [[ -L $path ]]; then info "$path is back already"
        elif [[ ! -e $path && -e $stored ]]; then info "re-enable $path -> $stored"; todo+=("$kind"$'\t'"$path"$'\t'"$stored")
        elif [[ -e $path ]]; then die "$path exists and is not the link this installer removed — resolve by hand"
        else die "$stored (what $path linked to) is missing — restore it from $STATE/nginx-backup-*/ by hand"; fi ;;
    esac
  done <"$TAKEOVER"
  confirm restore

  enter_critical "restore-old-site"
  for l in "${todo[@]}"; do
    IFS=$'\t' read -r kind path stored <<<"$l"
    case $kind in
      confd|file) mv -- "$stored" "$path" || fail_nginx "could not move $stored back"; undo_op mv "$path" "$stored" ;;
      symlink) ln -s -- "$stored" "$path" || fail_nginx "could not re-create $path"; undo_op rm "$path" ;;
    esac
  done
  local parked=$STATE/$APP.conf.restored-$STAMP
  if [[ -f $NGINX_CONF ]]; then mv -- "$NGINX_CONF" "$parked" || fail_nginx "could not move $NGINX_CONF aside"; undo_op mv "$parked" "$NGINX_CONF"; fi

  local test_out
  if ! test_out=$(nginx -t 2>&1); then
    printf '%s\n' "$test_out" | sed 's/^/      /'
    fail_nginx "the old configuration no longer passes \`nginx -t\` (above); this site was left in place"
  fi
  systemctl reload nginx || fail_nginx "nginx did not reload"
  NGINX_UNDO=()
  mv -- "$TAKEOVER" "$TAKEOVER.restored-$STAMP"
  SWITCHED=1
  leave_critical

  # A reload is asynchronous: for a moment the old workers keep answering as
  # this site. Say "restored" only once the domain has actually stopped
  # answering as this app.
  if [[ -n $DOMAIN ]]; then
    if wait_handed_back; then
      ok "$DOMAIN is no longer this site on this server's nginx — the previous configuration is serving it"
    else
      warn "nginx was reloaded with the old configuration, but $DOMAIN still answers as this site after 15 s — check \`sudo nginx -T\` and the error log"
    fi
  fi
  info "this site's nginx file is parked at $parked"
  info "the app is still running on 127.0.0.1:$PORT; stop it with: sudo systemctl disable --now $APP"
  info "to switch back to the new site later: $ME update"
}

cmd_status() {
  load_deploy_conf; use_saved
  step "Cloudpathway website"
  info "domain:  ${DOMAIN:-(not installed)}  aliases: ${ALIASES[*]:-none}  port: $PORT  mode: ${MODE:-?}"
  local cur d mark; cur=$(current_release)
  if [[ -n $cur ]]; then info "release: $(basename "$cur")"; else info "release: none"; fi
  while read -r d; do
    [[ -n $d ]] || continue
    mark=''; [[ -e $d/.served ]] || mark=' (never served)'
    [[ $d == "$cur" ]] && mark+=' <- current'
    info "         $(basename "$d")$mark"
  done < <(releases_newest_first)
  info "service: $(systemctl is-active "$APP" 2>/dev/null || true) ($(systemctl is-enabled "$APP" 2>/dev/null || true))"
  local h; h=$(health_json)
  if [[ -n $h ]] && json_get "$h" 'j' >/dev/null 2>&1; then
    info "health:  $(json_get "$h" '(j.ok ? "ok" : "NOT OK") + (j.node ? ", node " + j.node + ", up " + j.uptimeSeconds + "s" : "")' || echo "$h")"
    info "db:      $(json_get "$h" '(j.db.ok ? "writable " : "NOT WRITABLE ") + j.db.path + (j.db.error ? " — " + j.db.error : "")' || true)"
    info "mail:    $(json_get "$h" 'j.mail.describe' || true)"
    info "import:  $(json_get "$h" 'j.portalImportLinks ? "portal import links on" : "PORTAL_URL not set — no import button"' || true)"
  else
    warn "no answer from http://127.0.0.1:$PORT/api/health${h:+: ${h:0:160}}"
  fi
  if [[ -f $TAKEOVER && -s $TAKEOVER ]]; then
    info "nginx:   $NGINX_CONF; restore-old-site would:"
    local kind path stored
    while IFS=$'\t' read -r kind path stored; do
      if [[ $kind == created ]]; then info "           remove it (nothing served ${DOMAIN:-the domain} before)"
      else info "           re-enable $path  (now $stored)"; fi
    done <"$TAKEOVER"
  elif [[ -f $NGINX_CONF ]]; then
    info "nginx:   $NGINX_CONF"
  else
    info "nginx:   not configured for this site"
  fi
  if [[ -f $IN_PROGRESS ]]; then warn "a run was stopped in the middle of a switch: $(cat "$IN_PROGRESS") — run update to bring everything back in line"; fi
  return 0
}

cmd_test_mail() {
  need_root; load_deploy_conf; use_saved
  [[ -n $MAIL_TO ]] || die "--to is required: $ME test-mail --to you@example.com"
  local app; app=$(current_release)
  [[ -n $app ]] || die "nothing is deployed yet — test-mail sends with the deployed release's own mail code"
  [[ -f $ENV_FILE ]] || die "$ENV_FILE does not exist yet"
  NODE_BIN=$(readlink -f "$(type -P node)")
  # test-mail imports the app's own lib/mailer.ts, which needs Node's built-in
  # TypeScript stripping: Node 22.18+ (the server's Node 24 has it).
  "$NODE_BIN" -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=18)?0:1)' \
    || die "test-mail needs Node 22.18 or newer (this is $("$NODE_BIN" -v)); the site itself runs fine on this Node"
  # Root reads the settings (only root can) and hands them over on stdin; the
  # app's code runs as the service account, exactly as the site would send.
  node "$ENVTOOL" export --env "$ENV_FILE" \
    | (cd / && runuser -u "$SVC_USER" -- "$NODE_BIN" --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning \
         "$app/deploy/test-mail.mjs" --env - --to "$MAIL_TO" --app "$app")
}

case $CMD in
  install|update) cmd_install ;;
  rollback) cmd_rollback ;;
  restore-old-site) cmd_restore_old_site ;;
  status) cmd_status ;;
  test-mail) cmd_test_mail ;;
  -h|--help|help) usage 0 ;;
  *) die "unknown command: $CMD (install, update, rollback, restore-old-site, status, test-mail)" ;;
esac
