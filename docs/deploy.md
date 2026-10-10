# Deploying the Cloudpathway website

One command installs the site behind the nginx you already run and takes over
`info.cloudpathway.org` from whatever serves it today. Everything it does can be
undone with one more command.

**It answers for the name you give it and nothing else.** The bare
`cloudpathway.org` and `www.cloudpathway.org` are not this site's: their nginx
blocks are left exactly as they are, and the new site's file names only
`info.cloudpathway.org`.

It is written for the same machine as the phone system portal — CentOS Stream
10 / RHEL family, nginx from the distribution, SELinux enforcing, Node 24,
Cloudflare in front — and follows the conventions of PhoneSystem's
`docs/deploy-centos10.md`: system accounts, the app under `/opt`, a hardened
systemd unit, nginx in `/etc/nginx/conf.d/`. It also runs on Debian/Ubuntu.

How a visit reaches the site on that machine (PhoneSystem's
`docs/cloudflare-tunnel.md`, §9b):

```
visitor ──https──▶ Cloudflare ──tunnel──▶ cloudflared ──http──▶ nginx :80   (this machine, Host: info.cloudpathway.org)
                                                                  │  /etc/nginx/conf.d/cloudpathway-web.conf
                                                                  ▼
                                               127.0.0.1:3100  next start   (systemd: cloudpathway-web)
                                                                  │
                                                                  ▼
                                    /opt/cloudpathway-web/data/cloudpathway.db  (leads, reseller applications)

portal.cloudpathway.org ──▶ same tunnel ──▶ nginx :80 ──▶ 127.0.0.1:4000   ← never touched
```

HTTPS ends at Cloudflare. nginx serves plain HTTP to `cloudflared`, exactly as
the current site does. The installer works this out for itself; see
[How visitors arrive](#how-visitors-arrive).

---

## Before you start

On a machine that already runs PhoneSystem, all of this is already there.

| Needed | Why | Check |
| --- | --- | --- |
| Node 20.9+ (24 is what this was tested on), **installed system-wide** | runs the site | `sudo bash -c 'command -v node; node -v'` |
| npm, git, nginx, curl, tar | build, fetch, serve | `command -v npm git nginx curl tar` (missing one: `sudo dnf -y install tar`, etc.) |
| `gcc-c++ make python3` | only if the SQLite module has no prebuilt binary for your Node | `sudo dnf -y install gcc-c++ make python3` |
| ~1 GB free memory, ~1.5 GB free disk | `next build` | `free -m`, `df -h /opt` (the installer checks the disk) |
| `info.cloudpathway.org` reaching this nginx | it is being replaced | `curl -sS -H 'Host: info.cloudpathway.org' http://127.0.0.1/ \| head -5` shows today's site |

**"System-wide" matters on EL.** `sudo` there resets `PATH` to
`/sbin:/bin:/usr/sbin:/usr/bin`, so a Node in `/usr/local/bin` or under nvm is
invisible to the installer, and the service could not reach a Node inside a home
directory anyway. NodeSource — what the PhoneSystem guide uses — puts it in
`/usr/bin`.

**npm 11 and newer** run a dependency's install script only if `package.json`'s
`allowScripts` names it at its exact version. The SQLite module needs its
script, and `allowScripts` here names it. If you ever upgrade `better-sqlite3`,
run `npm approve-scripts better-sqlite3` in a development checkout and commit
the result. Otherwise the installer stops at "better-sqlite3 does not load",
before anything is switched.

---

## 1. Get the code onto the server

As your normal user, with the same GitHub access you use for PhoneSystem (the
repository is private):

```bash
cd ~
git clone https://github.com/shimmel72/Cloudpathway_website.git
cd Cloudpathway_website
git checkout claude/cloudpathway-connectivity-nrtgwt   # until this is merged to main
```

The installer deploys the **last commit** of this checkout, not its working
tree. Uncommitted edits are reported and left out.

Run it as `sudo bash deploy/install.sh …`, from the checkout. Plain
`sudo ./deploy/install.sh` also works once the file is executable in your
checkout, but `bash` works whatever git did with the file mode.

## 2. Look before you replace anything

```bash
sudo bash deploy/install.sh install --domain info.cloudpathway.org --dry-run
```

This changes nothing on the server. It does send one ordinary request to
`https://info.cloudpathway.org/` from outside, to see how the site answers today. It
prints:

- what serves `info.cloudpathway.org` today, and which file would be switched off
- whether the checkout you run it from sits inside a folder nginx serves (see
  [Where the checkout lives](#where-the-checkout-lives))
- how visitors reach the site, and so how nginx will serve it (see below)
- the exact nginx configuration it would write

Read it.

If it reports a **conflict**, see [below](#if-the-installer-reports-a-conflict).
It means the current configuration cannot be taken over without risking
something else on the box. Nothing is changed until it is resolved by hand.

## How visitors arrive

The installer decides between three ways of serving the site. It decides from
evidence, never from what happens to be lying around on disk.

| What it finds | Mode | nginx serves |
| --- | --- | --- |
| `cloudflared` sends `info.cloudpathway.org` to nginx on this machine's port 80 | **tunnel** | plain HTTP on :80 with **no** redirect to https. Visitors' addresses come from `CF-Connecting-IP`, trusted only from this machine's own addresses and only in this site's block |
| the current site serves HTTPS itself | **tls** | HTTPS with the current site's certificate; :80 redirects |
| the current site is plain HTTP, no tunnel | **http** | plain HTTP, as now |

Where the evidence comes from:

- **A locally managed tunnel** (`cloudflared` run with `--config`, or with
  `/etc/cloudflared/config.yml`): its `ingress:` rules are read, matched top
  down, first match wins, exactly as `cloudflared` does.
- **A dashboard-managed tunnel** (run with `--token`): the rules live at
  Cloudflare, so the installer sends a request in through Cloudflare and looks
  for it in nginx's log. Arriving from `127.0.0.1` means through a tunnel on
  this machine. If that cannot be established, the install stops and asks for
  `--cloudflare-tunnel` (Zero Trust → Networks → Tunnels → your tunnel → Public
  Hostname shows `info.cloudpathway.org` → `http://localhost:80`) or
  `--no-cloudflare-tunnel`.
- **A tunnel that sends the domain somewhere other than nginx on :80**: the
  install stops. Changing nginx would not change what visitors see.

Two rules hold in every mode:

- **It never adds HTTPS the current site does not have.** `--tls` asks for it,
  outside a tunnel only, and only with a certificate that renews itself
  ([TLS](#tls)).
- **It never relies on a certificate that cannot renew itself** for anything
  new. One issued by hand (`certbot --manual` over DNS, as the one for
  `cloudpathway.org` on this server was) is reported and left alone.

## 3. Install

```bash
sudo bash deploy/install.sh install --domain info.cloudpathway.org --import-phonesystem-env
```

You will be asked to type `replace`. Then, in this order:

1. **Build** the release as its own account, `cloudpathway-build`: `npm ci`,
   `npm run build`, `npm prune --omit=dev`. That account cannot read the running
   site's settings (the Telnyx key) or its database. The finished release is
   handed to root, so neither the build nor the site can change it afterwards.
   Then the native SQLite module is loaded as the site's own account. The old
   site keeps serving throughout. A failed build changes nothing.
2. **Settings**: `/etc/cloudpathway-web/env` is created (root, mode 600).
   `--import-phonesystem-env` fills its blanks from
   `/opt/phonesystem/app/server/.env`: the Telnyx key, the sending address (as
   `Cloudpathway <same@address>`), and the portal's `PUBLIC_BASE_URL` as
   `PORTAL_URL`. It never overwrites a value that is already set. Leave the
   flag off to fill the file in by hand. Each line is checked the way systemd
   will read it, and anything systemd would deliver differently from what you
   wrote is pointed out.
3. **Start** the app on `127.0.0.1:3100` and wait for its health check. If it
   does not come up, the previous release (and the previous systemd unit) is
   put back. nginx has not been touched, so visitors never saw it.
4. **nginx**:
   - the file that served the domain is renamed to `*.cloudpathway-disabled`
     (not deleted; a copy also goes to `/etc/cloudpathway-web/state/`)
   - the new `cloudpathway-web.conf` is written
   - `nginx -t` must pass, then nginx is reloaded
   - on SELinux, `httpd_can_network_connect` is turned on if it is not already
5. **Check on this machine**, the way requests arrive: through the tunnel, plain
   `http://` with the domain's Host header, the way `cloudflared` connects.
   Outside a tunnel, `https://` with the certificate not verified, plus the
   `http://` redirect. Also checked:
   - `www.` redirects to the bare domain
   - behind a tunnel, visitors' real addresses come through
6. **Check from the internet's side**: the name is looked up with Cloudflare's
   public resolver (this machine's own `/etc/hosts` points it straight back
   here). Then `https://info.cloudpathway.org/api/health` must answer as the new
   site. A redirect there fails the check, because behind Cloudflare it is a
   loop. If the site answered from outside before the switch and does not
   now, that fails it too.

**If step 5 or 6 fails, nginx is put back the way it was** (and on an update,
the previous release too). The old site keeps serving. The redirect and
real-address checks in step 5 only warn: the site works without them.

Steps 3–6 run as one protected switch. Ctrl-C and a dropped SSH connection
are ignored until it has been checked, and anything that stops it unexpectedly
puts back what it had changed. Ctrl-C before that, during the build, stops at
once and removes the unfinished build. If the whole machine dies mid-switch,
the next `install` or `update` notices. It restarts the last release known to
work before it builds again.

## 4. Prove mail works

```bash
sudo bash deploy/install.sh test-mail --to 12shimmel@gmail.com
```

This sends through the deployed site's own mail code, the same function the
reseller form uses, as the site's own account. So a pass proves the real
request. "Accepted" is not "delivered": check the inbox. If Telnyx refuses the
sender, the domain in `MAIL_FROM` is not verified in Telnyx Email.
PhoneSystem's `scripts/telnyx-email.mjs --domain …` walks that whole chain.

## 5. The portal's import button

Reseller application emails carry an **Import into the portal** button. The
portal needs a small change to read it:
[`docs/phonesystem-reseller-import.patch`](phonesystem-reseller-import.patch)
(see [`reseller-applications.md`](reseller-applications.md)). Until it is in,
the button opens the Resellers page without filling it in.

Put it in through the PhoneSystem repository, not by editing the server's copy.
The portal serves a built bundle, so an edit to the source on the server does
nothing until a rebuild. And `scripts/update.sh` refuses to pull over local
edits (`pull --ff-only`), so a hand-patched checkout stops updating the first
time upstream touches that file. In a development clone of PhoneSystem:

```bash
git apply /path/to/Cloudpathway_website/docs/phonesystem-reseller-import.patch
git commit -am "Resellers: prefill the create form from a website application"
git push
```

then on the server, as usual:

```bash
sudo /opt/phonesystem/app/scripts/update.sh
```

(If you already patched the server's checkout by hand, undo that first:
`sudo -u phonesystem git -C /opt/phonesystem/app checkout -- web/src/pages/Resellers.tsx`.
The `phonesystem` account is whichever owns `/opt/phonesystem/app`.)

---

## Day to day

```bash
sudo bash deploy/install.sh status     # mode, releases, health, mail, what was replaced
```

**Update** after new commits:

```bash
cd ~/Cloudpathway_website && git pull
sudo bash deploy/install.sh update
```

Once this branch is merged, move the checkout to `main` first, once:
`git checkout main && git pull`. Otherwise `git pull` keeps fetching the old
branch, and `update` redeploys stale code.

The new release builds while the current one serves. The switch itself is a
restart of a couple of seconds, during which nginx answers 502. The database
is copied to `/opt/cloudpathway-web/backups/` before every switch, and the copy
is compared with the original (the newest ten are kept). The last three
releases that served stay on disk. `update` keeps the domain, port and mode
it was installed with.

**Change a setting**: edit `/etc/cloudpathway-web/env`, then
`sudo systemctl restart cloudpathway-web`. If systemd ever answers "start
request repeated too quickly" (more than ten starts in a minute),
`sudo systemctl reset-failed cloudpathway-web` and start it again.

| Setting | What it does |
| --- | --- |
| `TELNYX_API_KEY` | same key the phone system uses |
| `MAIL_FROM` | `'Cloudpathway <no-reply@your-verified-domain>'` |
| `PORTAL_URL` | the portal's `https://` address — enables the import button |
| `RESELLER_APPLICATION_TO` | where applications go (default `12shimmel@gmail.com`) |

Put values in single quotes, as above. The file is read by systemd, not by a
shell.

## Undo

```bash
sudo bash deploy/install.sh rollback           # the release that served before this one
sudo bash deploy/install.sh restore-old-site   # give info.cloudpathway.org back to the old site
```

`rollback` only ever goes to a release that has served before. A build that
failed is never a rollback target. It leaves the database alone: its schema
only ever gains tables and columns, so an older release reads it fine. A
second `rollback` goes further back.

`restore-old-site` re-enables exactly the files the install switched off, or
removes the site again if nothing served the domain before. It then parks this
site's nginx file in `/etc/cloudpathway-web/state/`, checks `nginx -t`, reloads,
and waits until the domain is no longer answered by this site. If it is
interrupted, run it again: it picks up where it stopped. The app keeps running
unreferenced; stop it with `sudo systemctl disable --now cloudpathway-web`.
Running `update` later takes the domain over again (and asks for `replace`
again).

---

## Cloudflare tunnel

Nothing in Cloudflare changes for this. The tunnel already sends
`info.cloudpathway.org` to nginx on port 80, and nginx picks the site by Host
header, as it does today. In the dashboard (Zero Trust → Networks → Tunnels →
your tunnel → Public Hostname), or `/etc/cloudflared/config.yml` for a locally
managed tunnel, the rule for the name must be:

```yaml
  - hostname: info.cloudpathway.org
    service: http://localhost:80      # or http://127.0.0.1:80
```

**No HTTP Host Header override on it** (dashboard: Additional application
settings → HTTP Settings → HTTP Host Header; config: `httpHostHeader`). nginx
routes on the Host header, so an override set to, say, `cloudpathway.org` would
keep sending visitors to the old site. The check from the internet's side would
then fail and put nginx back. The installer says so when that happens.

What the installer writes for a tunnel, and why:

- **No `return 301 https://…` on port 80.** `cloudflared` always speaks plain
  HTTP to the origin, so a redirect there sends the visitor's https request back
  through the tunnel as http, forever. Cloudflare's own "Always Use HTTPS"
  handles http visitors.
- **`set_real_ip_from` this machine's own addresses, `real_ip_header
  CF-Connecting-IP`**, in this site's server block only. Every request arrives
  from `cloudflared` on this machine, so without it all visitors share one form
  rate limit, and the access log shows only the server itself. Loopback is
  always trusted. So are the machine's other addresses, because a service URL
  that resolves through `/etc/hosts` makes `cloudflared` connect via the public
  IP instead. Only a process on this machine can connect from those addresses,
  so nobody can set the header from outside. The portal's blocks are not
  affected.
- `X-Forwarded-Proto` is passed through from Cloudflare (`https`), so the app
  knows the visitor used https.

Cloudflare's SSL mode ("Full (strict)" here) governs connections from
Cloudflare to an origin's port 443. A tunnel does not use that path, so the
setting has no effect on the site either way.

## TLS

Only relevant without a tunnel.

- **The current site serves HTTPS**: its certificate is kept, from its
  `ssl_certificate` lines (in the block, an included snippet, or `http{}`). If
  that certificate renews automatically (certbot, any authenticator but a
  hook-less `--manual`), HSTS is sent for six months, without
  `includeSubDomains`. If it cannot renew itself, or nothing here can tell, it
  is still used (the old site used it) but HSTS is left off. That way, when it
  expires, visitors get a warning they can click through, not a site they
  cannot open. The plan warns if it has expired or does not cover a name being
  served.
- **The current site is plain HTTP**: so is the new one. To add HTTPS, get a
  certificate that renews itself, then pass `--tls`:

  ```bash
  sudo certbot certonly --nginx -d info.cloudpathway.org \
       --deploy-hook "systemctl reload nginx"
  sudo bash deploy/install.sh update --tls
  ```

  `--tls` refuses a certificate issued with `certbot --manual`. Such a
  certificate cannot renew without someone editing DNS by hand, and would take
  the site down when it expires.
- If certbot renews by **webroot**, the challenge path keeps being served from
  that directory on both ports, so renewals keep working once the site is
  proxied. Renewals by the nginx plugin need nothing.

**The hand-issued certificate for `cloudpathway.org` on this server** is not
used by the new site (it does not even cover `info.`), and behind the tunnel
nothing needs it. If
`sudo nginx -T | grep -n 'live/cloudpathway.org/'` finds nothing, nothing
uses it. `sudo certbot delete --cert-name cloudpathway.org` then stops
certbot's timer from failing to renew it every day.

## SELinux

nginx only *proxies* to the app — it never reads files under `/opt` — so there
are no file contexts to change. The one requirement is
`httpd_can_network_connect`, which the PhoneSystem portal already needs and the
installer turns on if it is off. The nginx file is written inside `conf.d` and
renamed into place so it carries the right label.

## If the installer reports a conflict

The installer only switches off a file when **every** server block in it belongs
to the domain (`info.cloudpathway.org`, or its `www.` if it had one), and only adds a file that
leaves every other site's behaviour as it was. Anything else is reported, and
nothing is changed:

| Message | Fix |
| --- | --- |
| *the server block for info.cloudpathway.org also answers for …* | split it into two `server` blocks, and move the `info.cloudpathway.org` one into a file of its own in `/etc/nginx/conf.d/`, leaving the other file otherwise as it is |
| *this file also holds a server block for …* | move the `info.cloudpathway.org` block into its own file in `/etc/nginx/conf.d/` |
| *lives in /etc/nginx/nginx.conf, which this installer will not edit* | move that `server` block into `/etc/nginx/conf.d/cloudpathway.conf` |
| *server_name .cloudpathway.org also matches info.cloudpathway.org* | narrow the wildcard, or list the names it should serve |
| *nginx's default server there today is …/portal.conf* | that block answers requests by IP address (phones provisioning by IP, say) only because it happens to be first. This site's file would sort ahead of it. Make it explicit: change its `listen 80;` to `listen 80 default_server;` |
| *serves info.cloudpathway.org again, and the copy this installer disabled before is still at …* | decide which of the two to keep and delete or move the other |

Then `sudo nginx -t && sudo systemctl reload nginx`, and run the dry run again.

## Where the checkout lives

Not inside a folder nginx serves files from, such as `/usr/share/nginx/html/`.
A git checkout there hands anyone who reaches that server block its `.git`
directory (the whole private repository, history included), plus every source
file. Try `https://info.cloudpathway.org/.git/config` on a site served that way.
The installer never serves the checkout: it builds a copy into
`/opt/cloudpathway-web/releases/` and runs that. So the checkout can live
anywhere, and the installer warns when it finds one in a served folder.

Once the new site is live, give the checkout a home of its own:

```bash
cd ~ && git clone https://github.com/shimmel72/Cloudpathway_website.git
cd Cloudpathway_website && git checkout claude/cloudpathway-connectivity-nrtgwt
```

Run `install.sh` from there from now on; `update` remembers everything else.
Then move the old copy out of the web root rather than deleting it:

```bash
sudo mv /usr/share/nginx/html/Cloudpathway_website /root/info-site-before-cloudpathway-web
```

`restore-old-site` re-enables the old `info.cloudpathway.org` block, which
served that folder. Move the folder back first if you ever use it.

## Troubleshooting

| Symptom | Look at |
| --- | --- |
| 502 from nginx | `journalctl -u cloudpathway-web -n 50`; if the app is healthy (`status`), it is SELinux: `sudo ausearch -m AVC -ts recent` |
| the site loops between http and https | something on port 80 redirects to https behind the tunnel; `sudo nginx -T` for a `return 301 https` in the domain's blocks |
| every visitor is `127.0.0.1` in the access log | the realip lines are missing; re-run `update` |
| forms return 500 | `status` → `db:`; the data directory must be writable by `cloudpathway` |
| applications stored but not emailed | `status` → `mail:`, then `test-mail` |
| no import button in the email | `PORTAL_URL` is empty |
| anything else | `/var/log/cloudpathway-web-deploy.log`, `/var/log/nginx/cloudpathway-web.error.log` |

`curl -s localhost:3100/api/health` on the server gives the full health report.
The same URL through nginx only ever says `{"ok":true}`.

## Where everything is

| Path | What |
| --- | --- |
| `/opt/cloudpathway-web/current` | symlink to the live release |
| `/opt/cloudpathway-web/releases/` | the last three releases that served (root-owned; `.served` marks them) |
| `/opt/cloudpathway-web/data/` | the database (service-owned, 750) |
| `/opt/cloudpathway-web/backups/` | database copies before each switch (root only) |
| `/opt/cloudpathway-web/.npm`, `.build-home` | the build account's npm cache and home |
| `/etc/cloudpathway-web/env` | settings (root, 600) |
| `/etc/cloudpathway-web/deploy.conf` | domain, aliases, port and mode remembered for `update` |
| `/etc/cloudpathway-web/state/` | backups of replaced nginx files and units, the takeover record |
| `/etc/systemd/system/cloudpathway-web.service` | the unit (rewritten on every run) |
| `/etc/nginx/conf.d/cloudpathway-web.conf` | the vhost (rewritten on every run) |
| `/var/log/cloudpathway-web-deploy.log` | every installer run |

Accounts: `cloudpathway` runs the site; `cloudpathway-build` only builds.
