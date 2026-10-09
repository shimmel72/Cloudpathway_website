#!/usr/bin/env bash
# Cloudpathway website — install, update, roll back, and hand the domain back.
#
#   sudo ./deploy/install.sh install --domain cloudpathway.org [--import-phonesystem-env] [--dry-run]
#   sudo ./deploy/install.sh update            # after `git pull` in this checkout
#   sudo ./deploy/install.sh rollback          # previous release
#   sudo ./deploy/install.sh restore-old-site  # give the domain back to whatever served it before
#   sudo ./deploy/install.sh status
#   sudo ./deploy/install.sh test-mail --to you@example.com
#
# Written for the same host shape as the PhoneSystem portal (CentOS Stream 10 /
# RHEL family, nginx from the distribution, SELinux enforcing, Node 24), and
# tolerant of Debian/Ubuntu. Full walkthrough: docs/deploy.md.
#
# The order is the safety: the new release is built while the current site
# keeps serving; it is switched in only if it builds; nginx is changed only once
# the app answers its health check; and if the site does not answer through
# nginx afterwards, nginx is put back the way it was.

set -Eeuo pipefail
shopt -s inherit_errexit 2>/dev/null || true
umask 022

APP=cloudpathway-web
SVC_USER=cloudpathway
BASE=/opt/$APP
ETC=/etc/$APP
ENV_FILE=$ETC/env
DEPLOY_CONF=$ETC/deploy.conf
STATE=$ETC/state
TAKEOVER=$STATE/nginx-takeover.tsv
UNIT=/etc/systemd/system/$APP.service
NGINX_CONF=/etc/nginx/conf.d/$APP.conf
LOG=/var/log/$APP-deploy.log
LOCK=/run/$APP-deploy.lock
DEFAULT_PORT=3100
KEEP_RELEASES=3
KEEP_DB_BACKUPS=10
PS_ENV_DEFAULT=/opt/phonesystem/app/server/.env

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO=$(cd -- "$SCRIPT_DIR/.." && pwd)
PLANNER=$SCRIPT_DIR/lib/nginx-plan.mjs
ENVTOOL=$SCRIPT_DIR/lib/env-tool.mjs
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

usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

# ------------------------------------------------------------------ args ----
CMD=${1:-}; [[ -n $CMD ]] || usage 2; shift || true
DOMAIN= ; PORT= ; DRY_RUN=0 ; ASSUME_YES=0 ; IMPORT_PS= ; MAIL_TO=
ALIASES=()
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain) DOMAIN=${2:-}; shift 2 ;;
    --domain=*) DOMAIN=${1#*=}; shift ;;
    --alias) ALIASES+=("${2:-}"); shift 2 ;;
    --alias=*) ALIASES+=("${1#*=}"); shift ;;
    --port) PORT=${2:-}; shift 2 ;;
    --port=*) PORT=${1#*=}; shift ;;
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

# ------------------------------------------------------------------ basics --
need_root() { [[ $EUID -eq 0 ]] || die "run with sudo: sudo $0 $CMD …"; }

take_lock() {
  exec 9>"$LOCK"
  flock -n 9 || die "another $APP deploy is running (lock: $LOCK)"
}

start_log() {
  # Everything from here on is also appended to the deploy log.
  touch "$LOG"; chmod 640 "$LOG"
  exec > >(tee -a "$LOG") 2>&1
  printf '\n===== %s %s %s =====\n' "$STAMP" "$CMD" "$*" >>"$LOG"
}

git_repo() { git -C "$REPO" -c safe.directory="$REPO" "$@"; }

load_deploy_conf() {
  [[ -f $DEPLOY_CONF ]] || return 0
  local k v
  while IFS='=' read -r k v; do
    case $k in
      DOMAIN) [[ -n $DOMAIN ]] || DOMAIN=$v ;;
      PORT) [[ -n $PORT ]] || PORT=$v ;;
      ALIASES) [[ ${#ALIASES[@]} -gt 0 || -z $v ]] || read -r -a ALIASES <<<"$v" ;;
    esac
  done <"$DEPLOY_CONF"
}

save_deploy_conf() {
  install -d -m 755 "$ETC"
  printf 'DOMAIN=%s\nPORT=%s\nALIASES=%s\n' "$DOMAIN" "$PORT" "${ALIASES[*]:-}" >"$DEPLOY_CONF.tmp"
  chmod 644 "$DEPLOY_CONF.tmp"; mv -f "$DEPLOY_CONF.tmp" "$DEPLOY_CONF"
}

confirm() {
  # $1 = word the operator must type
  [[ $ASSUME_YES -eq 1 ]] && return 0
  [[ -r /dev/tty ]] || die "this needs confirmation; re-run with --yes to proceed non-interactively"
  local answer
  printf '\n    Type %s%s%s to continue, anything else to stop: ' "$B" "$1" "$N" >/dev/tty
  read -r answer </dev/tty || true
  [[ $answer == "$1" ]] || die "stopped — nothing was changed by this step"
}

current_release() { [[ -L $BASE/current ]] && readlink -f "$BASE/current" || true; }

# Release directories, newest first. By NAME, which starts with a UTC timestamp:
# a build touches directory mtimes, so mtime order is not deploy order.
releases_newest_first() { find "$BASE/releases" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -r; }

# Every request here is to this machine. --noproxy, or a host with a system-wide
# https_proxy sends the installer's own health checks out to the internet.
health_json() { curl --noproxy '*' -fsS --max-time 3 "http://127.0.0.1:$PORT/api/health" 2>/dev/null || true; }

json_get() {  # json_get '<json>' 'expr on j'
  node -e 'let j; try { j = JSON.parse(process.argv[1]); } catch { process.exit(1); } const v = (new Function("j", "return " + process.argv[2]))(j); if (v === undefined || v === null) process.exit(1); console.log(typeof v === "object" ? JSON.stringify(v) : v);' "$1" "$2"
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

# ------------------------------------------------------------------ preflight
NODE_BIN= ; NGINX_VERSION= ; PLAN_FILE=

preflight() {
  step "Checking this machine"
  [[ -r /etc/os-release ]] && . /etc/os-release && info "${PRETTY_NAME:-unknown OS}"
  case " ${ID:-} ${ID_LIKE:-} " in
    *" rhel "*|*" fedora "*|*" centos "*|*" debian "*|*" ubuntu "*) ;;
    *) warn "untested distribution — continuing, but read the plan before confirming" ;;
  esac

  local c
  for c in git node npm nginx curl flock runuser systemctl tar; do
    command -v "$c" >/dev/null || die "$c is not installed (docs/deploy.md, \"Before you start\")"
  done

  NODE_BIN=$(readlink -f "$(command -v node)")
  case $NODE_BIN in
    /home/*|/root/*) die "node is $NODE_BIN — inside a home directory, which the service cannot see (ProtectHome). Install Node system-wide (NodeSource), as the PhoneSystem guide does." ;;
  esac
  local nv; nv=$(node -p 'process.versions.node')
  node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>20||(a===20&&b>=9)?0:1)' \
    || die "Node $nv is too old; 20.9+ is required and the server's Node 24 is what this was tested on"
  ok "node $nv at $NODE_BIN, npm $(npm --version)"

  NGINX_VERSION=$(nginx -v 2>&1 | sed -n 's#.*nginx/\([0-9.]*\).*#\1#p')
  [[ -n $NGINX_VERSION ]] || die "could not read the nginx version from \`nginx -v\`"
  nginx -t >/dev/null 2>&1 || die "nginx's current configuration does not pass \`nginx -t\`. Fix that first — this installer will not build on a broken config."
  ok "nginx $NGINX_VERSION, current configuration valid"

  [[ -f $REPO/package.json ]] && grep -q '"name": "cloudpathway-website"' "$REPO/package.json" \
    || die "$REPO does not look like the Cloudpathway_website checkout"
  git_repo rev-parse --verify HEAD >/dev/null 2>&1 || die "$REPO is not a git checkout with a commit"
  if [[ -n $(git_repo status --porcelain --untracked-files=no) ]]; then
    warn "this checkout has uncommitted changes — they are NOT deployed. What deploys is the last commit, $(git_repo rev-parse --short HEAD)."
  fi
  ok "deploying $(git_repo rev-parse --short HEAD) — $(git_repo log -1 --format=%s | cut -c1-70)"

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
  if command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
    local svcs; svcs=$(firewall-cmd --list-services 2>/dev/null || true)
    [[ $svcs == *http* ]] || warn "firewalld does not list http/https as open — if the old site was reachable it may use ports; check \`firewall-cmd --list-all\`"
  fi
}

# ---------------------------------------------------------------- nginx plan
make_plan() {
  step "Working out what serves $DOMAIN today"
  PLAN_FILE=$(mktemp)
  local alias_args=() a
  for a in "${ALIASES[@]}"; do [[ -n $a ]] && alias_args+=(--alias "$a"); done
  nginx -T 2>/dev/null | node "$PLANNER" plan --domain "$DOMAIN" "${alias_args[@]}" --own-file "$NGINX_CONF" >"$PLAN_FILE"

  # No certificate in the old config, but certbot may hold one for the name.
  if [[ $(json_get "$(cat "$PLAN_FILE")" 'j.tls' || echo null) == null ]] \
     && [[ -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem && -f /etc/letsencrypt/live/$DOMAIN/privkey.pem ]]; then
    node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1])); p.tls={cert:process.argv[2]+"/fullchain.pem",key:process.argv[2]+"/privkey.pem",includesLeOptions:true}; fs.writeFileSync(process.argv[1], JSON.stringify(p,null,2));' \
      "$PLAN_FILE" "/etc/letsencrypt/live/$DOMAIN"
    info "no certificate in the old config, but certbot has one for $DOMAIN — using it"
  fi

  # Renewals by webroot must keep being answered once the site is proxied.
  local cert certname renew webroot
  cert=$(json_get "$(cat "$PLAN_FILE")" 'j.tls && j.tls.cert' || true)
  if [[ $(json_get "$(cat "$PLAN_FILE")" 'j.acmeRoot' || echo null) == null && $cert == /etc/letsencrypt/live/*/* ]]; then
    certname=${cert#/etc/letsencrypt/live/}; certname=${certname%%/*}
    renew=/etc/letsencrypt/renewal/$certname.conf
    if [[ -f $renew ]] && grep -Eq '^\s*authenticator\s*=\s*webroot' "$renew"; then
      webroot=$(sed -nE "s/^\s*(${DOMAIN//./\\.}|webroot_path)\s*=\s*([^,]+),?\s*$/\2/p" "$renew" | head -1)
      if [[ -n $webroot ]]; then
        node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1])); p.acmeRoot=process.argv[2]; fs.writeFileSync(process.argv[1], JSON.stringify(p,null,2));' "$PLAN_FILE" "$webroot"
        info "certbot renews by webroot ($webroot) — the challenge path will keep being served from there"
      fi
    fi
  fi

  local plan; plan=$(cat "$PLAN_FILE")
  local n_conf; n_conf=$(json_get "$plan" 'j.conflicts.length')
  if [[ $n_conf -gt 0 ]]; then
    printf '\n'
    json_get "$plan" 'j.conflicts.map(c => "    " + c.file + ":" + c.line + "\n      " + c.reason).join("\n")'
    die "nothing was changed. Each of the above has to be resolved by hand first — docs/deploy.md, \"If the installer reports a conflict\"."
  fi

  local names src
  names=$(json_get "$plan" 'j.oldServerNames.join(" ")' || true)
  src=$(json_get "$plan" 'j.source')
  case $src in
    existing-site) info "currently served by: $(json_get "$plan" 'j.toDisable.map(d => d.path).join(", ")') ($names)" ;;
    previous-install) info "already served by this site ($NGINX_CONF) — this is an update" ;;
    none) info "no server block names $DOMAIN — today it is answered by nginx's default server, which is left as it is" ;;
  esac
  local aliases; aliases=$(json_get "$plan" 'j.aliases.join(" ")' || true)
  [[ -n $aliases ]] && info "also answering for: $aliases (redirected to $DOMAIN)"
  if [[ -n $cert ]]; then
    ok "TLS with the existing certificate: $cert"
    if command -v openssl >/dev/null && [[ -r $cert ]]; then
      local end sans name
      end=$(openssl x509 -in "$cert" -noout -enddate 2>/dev/null | cut -d= -f2 || true)
      [[ -n $end ]] && info "certificate valid until $end"
      openssl x509 -in "$cert" -noout -checkend 0 >/dev/null 2>&1 || warn "that certificate has EXPIRED"
      sans=$(openssl x509 -in "$cert" -noout -ext subjectAltName 2>/dev/null || true)
      for name in "$DOMAIN" $aliases; do
        [[ $sans == *"DNS:$name"* ]] || warn "the certificate does not cover $name — browsers will warn on https://$name"
      done
    fi
  else
    warn "no certificate found for $DOMAIN — the site will be served over plain HTTP until you get one (docs/deploy.md, \"TLS\")"
  fi
}

render_nginx() {  # -> stdout
  local le='' f replaced=()
  local cert; cert=$(json_get "$(cat "$PLAN_FILE")" 'j.tls && j.tls.cert' || true)
  if [[ $cert == /etc/letsencrypt/* && -f /etc/letsencrypt/options-ssl-nginx.conf ]]; then
    le=/etc/letsencrypt/options-ssl-nginx.conf
  fi
  if [[ -f $TAKEOVER ]]; then
    while IFS=$'\t' read -r _ f _; do replaced+=(--replaced "$f"); done <"$TAKEOVER"
  fi
  while read -r f; do [[ -n $f ]] && replaced+=(--replaced "$f"); done \
    < <(json_get "$(cat "$PLAN_FILE")" 'j.toDisable.map(d => d.path).join("\n")' || true)
  node "$PLANNER" render --plan "$PLAN_FILE" --port "$PORT" --nginx-version "$NGINX_VERSION" \
    ${le:+--le-options "$le"} "${replaced[@]}"
}

# ------------------------------------------------------------------ the app
ensure_account() {
  step "Service account and directories"
  if ! id -u "$SVC_USER" >/dev/null 2>&1; then
    useradd --system --user-group --home-dir "$BASE" --no-create-home \
      --shell "$(command -v nologin || echo /sbin/nologin)" "$SVC_USER"
    ok "created system user $SVC_USER"
  else
    ok "system user $SVC_USER exists"
  fi
  install -d -m 755 -o root -g root "$BASE"
  install -d -m 755 -o "$SVC_USER" -g "$SVC_USER" "$BASE/releases" "$BASE/.npm"
  install -d -m 750 -o "$SVC_USER" -g "$SVC_USER" "$BASE/data"
  install -d -m 700 -o root -g root "$BASE/backups"
  install -d -m 755 -o root -g root "$ETC"
  install -d -m 700 -o root -g root "$STATE"
}

NEW_ID= ; NEW_DIR=
build_release() {
  local sha; sha=$(git_repo rev-parse HEAD)
  NEW_ID=$STAMP-${sha:0:12}
  NEW_DIR=$BASE/releases/$NEW_ID
  step "Building release $NEW_ID (the current site keeps serving meanwhile)"

  install -d -m 755 -o "$SVC_USER" -g "$SVC_USER" "$NEW_DIR"
  # Exactly the commit — no node_modules, .next, data or stray files from the checkout.
  git_repo archive --format=tar HEAD | tar -x -C "$NEW_DIR"
  printf '%s\n' "$NEW_ID" >"$NEW_DIR/.release"
  chown -R "$SVC_USER:$SVC_USER" "$NEW_DIR"

  local passthru=() v
  for v in http_proxy https_proxy HTTP_PROXY HTTPS_PROXY no_proxy NO_PROXY NODE_EXTRA_CA_CERTS npm_config_registry; do
    [[ -n ${!v:-} ]] && passthru+=("$v=${!v}")
  done
  # npm ci with dev dependencies (the build needs TypeScript, Tailwind), build,
  # then prune them. The pruned tree is what runs; next.config.mjs is plain JS
  # precisely so that `next start` needs nothing that was pruned.
  if ! (cd "$NEW_DIR" && runuser -u "$SVC_USER" -- env -i \
        PATH="$(dirname "$NODE_BIN"):/usr/local/bin:/usr/bin:/bin" HOME="$BASE" \
        npm_config_cache="$BASE/.npm" npm_config_update_notifier=false npm_config_fund=false \
        NEXT_TELEMETRY_DISABLED=1 "${passthru[@]}" \
        bash -c 'set -e; npm ci --no-audit; npm run build; npm prune --omit=dev --no-audit') ; then
    rm -rf -- "$NEW_DIR"
    die "the build failed — nothing was switched; the current site is untouched. Output is above and in $LOG."
  fi
  # The native SQLite module is the part most likely to be wrong on a new Node.
  if ! (cd "$NEW_DIR" && runuser -u "$SVC_USER" -- "$NODE_BIN" -e \
        'const D=require("better-sqlite3"); new D(":memory:").prepare("select 1").get();') ; then
    rm -rf -- "$NEW_DIR"
    die "better-sqlite3 does not load under node $(node -v) — install gcc-c++ make python3 so it can compile, and retry. The current site is untouched."
  fi
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
    install -m 644 -o root -g root "$tmp" "$UNIT"; rm -f "$tmp"
    command -v restorecon >/dev/null && restorecon -F "$UNIT" 2>/dev/null || true
    systemctl daemon-reload
    ok "installed $UNIT"
  fi
  systemctl enable "$APP" >/dev/null 2>&1
}

backup_db() {  # service must be stopped
  local db=$BASE/data/cloudpathway.db dest=$BASE/backups/$1 f
  [[ -f $db ]] || return 0
  install -d -m 700 "$dest"
  for f in "$db" "$db-wal" "$db-shm"; do [[ -f $f ]] && cp -a -- "$f" "$dest/"; done
  info "database copied to $dest"
  # keep the newest $KEEP_DB_BACKUPS (named by release id, so name order is time order)
  find "$BASE/backups" -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n +$((KEEP_DB_BACKUPS + 1)) | xargs -r rm -rf --
}

point_current_at() {
  ln -sfn "$1" "$BASE/current.next"
  mv -Tf "$BASE/current.next" "$BASE/current"
}

switch_to() {  # $1 = release dir. Succeeds only if that release comes up healthy.
  local dir=$1 id prev
  id=$(basename "$dir"); prev=$(current_release)
  step "Switching to $id"
  if systemctl is-active --quiet "$APP"; then systemctl stop "$APP"; fi
  backup_db "$id"
  point_current_at "$dir"
  systemctl reset-failed "$APP" >/dev/null 2>&1 || true
  systemctl start "$APP" || true   # judged by the health check below, not by systemctl
  if wait_healthy "$id"; then
    ok "$id is serving on 127.0.0.1:$PORT"
    return 0
  fi
  warn "$id did not become healthy. Last service log lines:"
  journalctl -u "$APP" -n 30 --no-pager 2>/dev/null | sed 's/^/      /' || true
  if [[ -n $prev && -d $prev && $prev != "$dir" ]]; then
    warn "putting $(basename "$prev") back"
    systemctl stop "$APP" || true
    point_current_at "$prev"
    systemctl reset-failed "$APP" >/dev/null 2>&1 || true
    systemctl start "$APP" || true
    if wait_healthy "$(basename "$prev")"; then
      ok "$(basename "$prev") is serving again"
      # It never served successfully, so it must not hold one of the kept slots
      # or be what a later `rollback` lands on. Its log is in journalctl.
      rm -rf -- "$dir"
      info "removed the failed release $id"
    else
      warn "the previous release did not come back either — see journalctl -u $APP"
    fi
  fi
  return 1
}

prune_releases() {
  local cur; cur=$(current_release)
  local old
  old=$(releases_newest_first | grep -vxF "$cur" | tail -n +"$KEEP_RELEASES" || true)
  [[ -z $old ]] && return 0
  while read -r d; do [[ -n $d ]] && rm -rf -- "$d" && info "removed old release $(basename "$d")"; done <<<"$old"
}

# ------------------------------------------------------------------ nginx
# Undo log for this run's nginx changes: "op<TAB>a<TAB>b" entries replayed in
# reverse by run_ops. Typed operations rather than eval'd strings, so a path
# can never be interpreted as shell.
NGINX_UNDO=()
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

selinux_allow_proxy() {
  command -v getenforce >/dev/null || return 0
  [[ $(getenforce) == Disabled ]] && return 0
  if [[ $(getsebool httpd_can_network_connect 2>/dev/null) != *"--> on" ]]; then
    info "setsebool -P httpd_can_network_connect 1 (persistent; can take a few seconds)"
    setsebool -P httpd_can_network_connect 1
  fi
}

disable_old_site() {  # from the plan's toDisable list
  local backup=$STATE/nginx-backup-$STAMP kind path stored
  install -d -m 700 "$backup"
  if [[ -f $TAKEOVER ]]; then cp -a -- "$TAKEOVER" "$backup/takeover.tsv"; undo_op cp "$backup/takeover.tsv" "$TAKEOVER"
  else undo_op rm "$TAKEOVER"; fi
  while IFS=$'\t' read -r kind path; do
    [[ -z $path ]] && continue
    cp -a -- "$path" "$backup/" 2>/dev/null || cp -aL -- "$path" "$backup/"
    case $kind in
      confd)
        stored=$path.cloudpathway-disabled
        mv -- "$path" "$stored"
        undo_op mv "$stored" "$path" ;;
      sites-enabled)
        if [[ -L $path ]]; then
          stored=$(readlink -f "$path"); rm -f -- "$path"
          kind='symlink'
          undo_op symlink "$stored" "$path"
        else
          install -d -m 700 "$STATE/displaced"
          stored=$STATE/displaced/$(basename "$path").$STAMP
          mv -- "$path" "$stored"
          kind='file'
          undo_op mv "$stored" "$path"
        fi ;;
      *) die "internal: unknown takeover kind $kind" ;;
    esac
    printf '%s\t%s\t%s\n' "$kind" "$path" "$stored" >>"$TAKEOVER"
    ok "disabled $path (copy in $backup)"
  done < <(json_get "$(cat "$PLAN_FILE")" 'j.toDisable.map(d => d.kind + "\t" + d.path).join("\n")' || true)
}

undo_nginx() {
  run_ops NGINX_UNDO
  if nginx -t >/dev/null 2>&1; then systemctl reload nginx || true; fi
}

configure_nginx() {
  step "nginx"
  local rendered; rendered=$(mktemp)
  render_nginx >"$rendered"

  if [[ -f $NGINX_CONF ]] && cmp -s "$rendered" "$NGINX_CONF" \
     && [[ $(json_get "$(cat "$PLAN_FILE")" 'j.toDisable.length') == 0 ]]; then
    rm -f "$rendered"; ok "$NGINX_CONF unchanged"
    return 0
  fi

  # Written inside conf.d (as a name nginx does not include) and renamed into
  # place: a file created elsewhere and moved here would carry the wrong
  # SELinux label, and nginx would be denied reading its own config.
  local staged=/etc/nginx/conf.d/.$APP.conf.new
  install -m 644 -o root -g root "$rendered" "$staged"; rm -f "$rendered"
  if [[ -f $NGINX_CONF ]]; then
    cp -a -- "$NGINX_CONF" "$STATE/$APP.conf.before-$STAMP"
    undo_op cp "$STATE/$APP.conf.before-$STAMP" "$NGINX_CONF"
  else
    undo_op rm "$NGINX_CONF"
  fi
  undo_op rm "$staged"

  disable_old_site
  mv -f -- "$staged" "$NGINX_CONF"
  command -v restorecon >/dev/null && restorecon -F "$NGINX_CONF" 2>/dev/null || true

  local test_out
  if ! test_out=$(nginx -t 2>&1); then
    printf '%s\n' "$test_out" | sed 's/^/      /'
    undo_nginx
    die "the new nginx configuration did not pass \`nginx -t\` (above). Everything was put back; the old site is still serving."
  fi
  selinux_allow_proxy
  systemctl reload nginx
  ok "nginx reloaded with $NGINX_CONF"
}

verify_through_nginx() {
  step "Checking the site through nginx, as a visitor would"
  local host scheme body code
  host=$(json_get "$(cat "$PLAN_FILE")" 'j.listenHosts["443"][0] || j.listenHosts["80"][0] || ""' || true)
  [[ -z $host || $host == "["* ]] && host=127.0.0.1
  if [[ -n $(json_get "$(cat "$PLAN_FILE")" 'j.tls && j.tls.cert' || true) ]]; then scheme=https; else scheme=http; fi
  local p=443; [[ $scheme == http ]] && p=80

  local i
  for ((i = 0; i < 10; i++)); do
    body=$(curl --noproxy '*' -sS -k --max-time 5 --resolve "$DOMAIN:$p:$host" "$scheme://$DOMAIN/api/health" 2>/dev/null || true)
    [[ $body == '{"ok":true}' ]] && break
    sleep 1
  done
  if [[ $body != '{"ok":true}' ]]; then
    code=$(curl --noproxy '*' -sS -k -o /dev/null -w '%{http_code}' --max-time 5 --resolve "$DOMAIN:$p:$host" "$scheme://$DOMAIN/api/health" 2>/dev/null || true)
    warn "$scheme://$DOMAIN/api/health answered ${code:-nothing}: ${body:0:200}"
    if [[ $body == *'"release"'* ]]; then
      warn "the detailed health view came back through nginx: X-Real-IP is not reaching the app"
    fi
    if [[ $code == 502 ]] && command -v ausearch >/dev/null; then
      warn "502 with the app healthy is almost always SELinux; recent denials:"
      ausearch -m AVC -ts recent 2>/dev/null | grep -i nginx | tail -3 | sed 's/^/      /' || true
    fi
    return 1
  fi
  ok "$scheme://$DOMAIN/ is the new site"
  if [[ $scheme == https ]]; then
    local loc
    loc=$(curl --noproxy '*' -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 5 --resolve "$DOMAIN:80:$host" "http://$DOMAIN/" 2>/dev/null || true)
    [[ $loc == "301 https://$DOMAIN/" ]] && ok "http:// redirects to https://" || warn "http://$DOMAIN/ answered: $loc"
  fi
}

# ------------------------------------------------------------------ commands
cmd_install() {
  need_root
  load_deploy_conf
  if [[ $CMD == update && -z $DOMAIN ]]; then die "nothing installed yet — use: install --domain cloudpathway.org"; fi
  [[ -n $DOMAIN ]] || die "--domain is required, e.g. --domain cloudpathway.org"
  DOMAIN=${DOMAIN,,}
  [[ $DOMAIN =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || die "\"$DOMAIN\" is not a hostname"
  PORT=${PORT:-$DEFAULT_PORT}
  [[ $PORT =~ ^[0-9]+$ && $PORT -ge 1024 && $PORT -le 65535 ]] || die "--port must be 1024-65535"

  if [[ $DRY_RUN -eq 1 ]]; then
    preflight
    make_plan
    step "nginx configuration that would be written to $NGINX_CONF"
    render_nginx | sed 's/^/    | /'
    step "Dry run — nothing was changed"
    rm -f "$PLAN_FILE"
    return 0
  fi

  take_lock
  start_log "--domain $DOMAIN --port $PORT"
  preflight
  make_plan

  if [[ $(json_get "$(cat "$PLAN_FILE")" 'j.toDisable.length') -gt 0 ]]; then
    printf '\n    %sThis replaces the site currently live at %s.%s\n' "$B" "$DOMAIN" "$N"
    info "The files above are disabled, not deleted, and copied to $STATE first."
    info "\`sudo $0 restore-old-site\` puts them back in seconds."
    confirm replace
  fi

  local planned_aliases
  planned_aliases=$(json_get "$(cat "$PLAN_FILE")" 'j.aliases.join(" ")' || true)
  read -r -a ALIASES <<<"$planned_aliases"

  ensure_account
  build_release
  install_env
  install_unit
  save_deploy_conf

  if ! switch_to "$NEW_DIR"; then
    die "the new release did not start. nginx was not touched — the site visitors see has not changed."
  fi

  configure_nginx
  if ! verify_through_nginx; then
    if [[ ${#NGINX_UNDO[@]} -gt 0 ]]; then
      warn "putting nginx back the way it was"
      undo_nginx
      die "the site did not answer through nginx, so nginx was restored — visitors see what they saw before. The app itself is running; see above for why nginx could not reach it."
    fi
    die "the site did not answer through nginx (above)"
  fi
  NGINX_UNDO=()

  prune_releases
  rm -f "$PLAN_FILE"
  step "Done — $DOMAIN is serving release $NEW_ID"
  info "status:   sudo $0 status"
  info "settings: sudo vi $ENV_FILE && sudo systemctl restart $APP"
  info "mail:     sudo $0 test-mail --to you@example.com"
  info "update:   git pull && sudo $0 update"
  info "undo:     sudo $0 rollback   |   sudo $0 restore-old-site"
}

cmd_rollback() {
  need_root; load_deploy_conf; PORT=${PORT:-$DEFAULT_PORT}
  take_lock; start_log
  local cur prev
  cur=$(current_release)
  [[ -n $cur ]] || die "nothing is deployed"
  # The newest release OLDER than the live one — so rolling back twice goes
  # further back, rather than bouncing forward to the release just left.
  prev=$(releases_newest_first | awk -v cur="$cur" '$0 < cur' | head -1 || true)
  [[ -n $prev ]] || die "there is no earlier release on disk to roll back to"
  info "current:  $(basename "$cur")"
  info "rollback: $(basename "$prev")"
  info "The database is left as it is (its schema only ever gains columns). Copies are in $BASE/backups/."
  confirm rollback
  switch_to "$prev" || die "rollback failed — see above"
  step "Rolled back to $(basename "$prev")"
}

cmd_restore_old_site() {
  need_root; load_deploy_conf
  [[ -f $TAKEOVER && -s $TAKEOVER ]] || die "there is no record of a site this installer replaced (nothing in $TAKEOVER)"
  take_lock; start_log
  step "Handing ${DOMAIN:-the domain} back to the previous configuration"
  local kind path stored
  while IFS=$'\t' read -r kind path stored; do info "re-enable $path"; done <"$TAKEOVER"
  confirm restore

  local lines l
  mapfile -t lines < <(tac "$TAKEOVER")
  for l in "${lines[@]}"; do
    IFS=$'\t' read -r kind path stored <<<"$l"
    [[ -e $path || -L $path ]] && die "$path exists again — not overwriting it; resolve by hand"
    [[ -e $stored ]] || die "$stored (the disabled copy of $path) is missing — restore it from $STATE/nginx-backup-*/ by hand"
  done
  for l in "${lines[@]}"; do
    IFS=$'\t' read -r kind path stored <<<"$l"
    case $kind in
      confd|file) mv -- "$stored" "$path"; undo_op mv "$path" "$stored" ;;
      symlink) ln -s -- "$stored" "$path"; undo_op rm "$path" ;;
    esac
  done
  local parked=$STATE/$APP.conf.restored-$STAMP
  if [[ -f $NGINX_CONF ]]; then mv -- "$NGINX_CONF" "$parked"; undo_op mv "$parked" "$NGINX_CONF"; fi

  local test_out
  if ! test_out=$(nginx -t 2>&1); then
    printf '%s\n' "$test_out" | sed 's/^/      /'
    run_ops NGINX_UNDO
    die "the old configuration no longer passes \`nginx -t\` (above); this site was left in place"
  fi
  NGINX_UNDO=()
  systemctl reload nginx
  mv -- "$TAKEOVER" "$TAKEOVER.restored-$STAMP"

  # A reload is asynchronous: for a moment the old workers keep answering as
  # this site. Say "restored" only once the domain has actually stopped
  # answering as this app.
  local i body still=1
  for ((i = 0; i < 20; i++)); do
    body=$(curl --noproxy '*' -sS -k --max-time 3 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/health" 2>/dev/null \
        || curl --noproxy '*' -sS --max-time 3 --resolve "$DOMAIN:80:127.0.0.1" "http://$DOMAIN/api/health" 2>/dev/null || true)
    if [[ $body != '{"ok":true}' ]]; then still=0; break; fi
    sleep 0.5
  done
  if [[ $still -eq 0 ]]; then
    ok "the previous site is serving ${DOMAIN:-the domain} again (checked through nginx)"
  else
    warn "nginx was reloaded with the old configuration, but $DOMAIN still answers as this site after 10s — check \`nginx -T\` and the error log"
  fi
  info "this site's config is parked at $parked"
  info "the app is still running on 127.0.0.1:${PORT:-$DEFAULT_PORT}; stop it with: sudo systemctl disable --now $APP"
  info "to switch back to the new site later: sudo $0 update"
}

cmd_status() {
  load_deploy_conf; PORT=${PORT:-$DEFAULT_PORT}
  step "Cloudpathway website"
  info "domain:  ${DOMAIN:-(not installed)}  aliases: ${ALIASES[*]:-none}  port: $PORT"
  local cur; cur=$(current_release)
  if [[ -n $cur ]]; then info "release: $(basename "$cur")"; else info "release: none"; fi
  info "on disk: $(ls -1t "$BASE/releases" 2>/dev/null | tr '\n' ' ')"
  info "service: $(systemctl is-active "$APP" 2>/dev/null || true) ($(systemctl is-enabled "$APP" 2>/dev/null || true))"
  local h; h=$(health_json)
  if [[ -n $h ]]; then
    info "health:  $(json_get "$h" '(j.ok ? "ok" : "NOT OK") + ", node " + j.node + ", up " + j.uptimeSeconds + "s"' || echo "$h")"
    info "db:      $(json_get "$h" '(j.db.ok ? "writable " : "NOT WRITABLE ") + j.db.path + (j.db.error ? " — " + j.db.error : "")' || true)"
    info "mail:    $(json_get "$h" 'j.mail.describe' || true)"
    info "import:  $(json_get "$h" 'j.portalImportLinks ? "portal import links on" : "PORTAL_URL not set — no import button"' || true)"
  else
    warn "no answer from http://127.0.0.1:$PORT/api/health"
  fi
  if [[ -f $TAKEOVER && -s $TAKEOVER ]]; then
    info "nginx:   $NGINX_CONF replaced:"
    local kind path stored; while IFS=$'\t' read -r kind path stored; do info "           $path  (now $stored)"; done <"$TAKEOVER"
  elif [[ -f $NGINX_CONF ]]; then
    info "nginx:   $NGINX_CONF (did not need to replace anything)"
  else
    info "nginx:   not configured for this site"
  fi
}

cmd_test_mail() {
  need_root
  [[ -n $MAIL_TO ]] || die "--to is required: sudo $0 test-mail --to you@example.com"
  local app; app=$(current_release); [[ -n $app ]] || app=$REPO
  # test-mail imports the app's own lib/mailer.ts, which needs Node's built-in
  # TypeScript stripping: Node 22.18+ (the server's Node 24 has it).
  node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=18)?0:1)' \
    || die "test-mail needs Node 22.18 or newer (this is $(node -v)); the site itself runs fine on this Node"
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning \
    "$SCRIPT_DIR/test-mail.mjs" --env "$ENV_FILE" --to "$MAIL_TO" --app "$app"
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
