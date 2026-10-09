# Deploying the Cloudpathway website

One command installs the site behind the nginx you already run, takes over
`cloudpathway.org` from whatever serves it today, and keeps that site's TLS
certificate. Everything it does can be undone with one more command.

It is written for the same machine as the phone system portal — CentOS Stream
10 / RHEL family, nginx from the distribution, SELinux enforcing, Node 24 — and
follows the conventions of PhoneSystem's `docs/deploy-centos10.md`: a system
service account, the app under `/opt`, a hardened systemd unit, nginx in
`/etc/nginx/conf.d/`. It also runs on Debian/Ubuntu.

```
visitor ──▶ nginx :443 (cloudpathway.org, existing certificate)
              │  /etc/nginx/conf.d/cloudpathway-web.conf
              ▼
            127.0.0.1:3100  next start   (systemd: cloudpathway-web, user cloudpathway)
              │
              ▼
            /opt/cloudpathway-web/data/cloudpathway.db   (leads, reseller applications)

portal.cloudpathway.org ──▶ nginx ──▶ 127.0.0.1:4000   ← never touched
```

---

## Before you start

On a machine that already runs PhoneSystem, all of this is already there.

| Needed | Why | Check |
| --- | --- | --- |
| Node 20.9+ (24 is what this was tested on), **installed system-wide** | runs the site | `sudo bash -c 'command -v node; node -v'` |
| npm, git, nginx, curl | build, fetch, serve | `command -v npm git nginx curl` |
| `gcc-c++ make python3` | only if the SQLite module has no prebuilt binary for your Node | `sudo dnf -y install gcc-c++ make python3` |
| ~1 GB free memory | `next build` | `free -m` (add swap on a small VPS) |
| `cloudpathway.org` already served by this nginx | it is being replaced | `sudo nginx -T \| grep -n cloudpathway.org` |

**"System-wide" matters on EL.** `sudo` there resets `PATH` to
`/sbin:/bin:/usr/sbin:/usr/bin`, so a Node in `/usr/local/bin` or under nvm is
invisible to the installer, and the service could not reach a Node inside a home
directory anyway. NodeSource — what the PhoneSystem guide uses — puts it in
`/usr/bin`.

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

## 2. Look before you replace anything

```bash
sudo ./deploy/install.sh install --domain cloudpathway.org --dry-run
```

This changes nothing. It prints what serves `cloudpathway.org` today, which file
would be switched off, the certificate it would keep using (and when that
expires), and the exact nginx configuration it would write. Read it.

If it reports a **conflict**, see [below](#if-the-installer-reports-a-conflict)
— it means the current config cannot be taken over without risking something
else on the box, and nothing will be changed until that is resolved by hand.

## 3. Install

```bash
sudo ./deploy/install.sh install --domain cloudpathway.org --import-phonesystem-env
```

You will be asked to type `replace`. Then, in this order:

1. **Build** the release in `/opt/cloudpathway-web/releases/<time>-<commit>/`
   as the `cloudpathway` user: `npm ci`, `npm run build`, `npm prune --omit=dev`,
   then a check that the native SQLite module loads. The old site is still
   serving throughout. A failed build changes nothing.
2. **Settings**: `/etc/cloudpathway-web/env` is created (root, mode 600).
   `--import-phonesystem-env` fills its blanks from
   `/opt/phonesystem/app/server/.env`: the Telnyx key, the sending address (as
   `Cloudpathway <same@address>`), and the portal's `PUBLIC_BASE_URL` as
   `PORTAL_URL`. It never overwrites a value that is already set. Leave the
   flag off to fill the file in by hand.
3. **Start** the app on `127.0.0.1:3100` and wait for its health check. If it
   does not come up, the previous release is put back — and nginx has not been
   touched, so visitors never saw it.
4. **nginx**: the file that served the domain is renamed to
   `*.cloudpathway-disabled` (not deleted; a copy also goes to
   `/etc/cloudpathway-web/state/`), the new `cloudpathway-web.conf` is written,
   `nginx -t` must pass, and nginx is reloaded. On SELinux,
   `httpd_can_network_connect` is turned on if it is not already.
5. **Check through nginx**, as a visitor: `https://cloudpathway.org/api/health`
   must answer, and `http://` must redirect. **If it does not, nginx is put back
   the way it was** and the old site keeps serving.

## 4. Prove mail works

```bash
sudo ./deploy/install.sh test-mail --to 12shimmel@gmail.com
```

This sends through the site's own mail code — the same function the reseller
form uses — so a pass proves the real request. "Accepted" is not "delivered":
check the inbox. If Telnyx refuses the sender, the domain in `MAIL_FROM` is not
verified in Telnyx Email; PhoneSystem's `scripts/telnyx-email.mjs --domain …`
walks that whole chain.

## 5. The portal's import button

Reseller application emails carry an **Import into the portal** button. The
portal needs a small change to read it:
[`docs/phonesystem-reseller-import.patch`](phonesystem-reseller-import.patch)
(see [`reseller-applications.md`](reseller-applications.md)). Until it is
applied, the button opens the Resellers page without filling it in.

---

## Day to day

```bash
sudo ./deploy/install.sh status     # release, health, mail, what was replaced
```

**Update** after new commits:

```bash
cd ~/Cloudpathway_website && git pull
sudo ./deploy/install.sh update
```

The new release builds while the current one serves; the switch itself is a
restart of a couple of seconds, during which nginx answers 502. The database is
copied to `/opt/cloudpathway-web/backups/` before every switch (the newest ten
are kept), and the last three releases stay on disk.

**Change a setting**: edit `/etc/cloudpathway-web/env`, then
`sudo systemctl restart cloudpathway-web`.

| Setting | What it does |
| --- | --- |
| `TELNYX_API_KEY` | same key the phone system uses |
| `MAIL_FROM` | `'Cloudpathway <no-reply@your-verified-domain>'` |
| `PORTAL_URL` | the portal's `https://` address — enables the import button |
| `RESELLER_APPLICATION_TO` | where applications go (default `12shimmel@gmail.com`) |

## Undo

```bash
sudo ./deploy/install.sh rollback           # the release before this one
sudo ./deploy/install.sh restore-old-site   # give cloudpathway.org back to the old site
```

`rollback` leaves the database alone — its schema only ever gains tables and
columns, so an older release reads it fine. A second `rollback` goes further
back.

`restore-old-site` re-enables exactly the files the install switched off,
parks this site's nginx file in `/etc/cloudpathway-web/state/`, checks
`nginx -t`, reloads, and confirms through nginx that the domain is no longer
answered by this site. The app keeps running unreferenced; stop it with
`sudo systemctl disable --now cloudpathway-web`. Running `update` later takes the
domain over again (and asks for `replace` again).

---

## TLS

- The certificate the old site used is reused — from its `ssl_certificate`
  lines, or from `/etc/letsencrypt/live/cloudpathway.org/` if certbot holds one.
  The plan warns if it has expired or does not cover a name being served.
- If certbot renews by **webroot**, the challenge path keeps being served from
  that directory on both ports, so renewals keep working once the site is
  proxied. (Renewals by the nginx plugin need nothing.)
- HSTS is sent for six months, without `includeSubDomains`, so it says nothing
  about the portal or any other subdomain.
- **No certificate found**: the site is served over plain HTTP — correct behind a
  Cloudflare proxy or tunnel. Otherwise get one without letting certbot edit the
  managed file, then re-render:

  ```bash
  sudo certbot certonly --nginx -d cloudpathway.org -d www.cloudpathway.org \
       --deploy-hook "systemctl reload nginx"
  sudo ./deploy/install.sh update
  ```

## SELinux

nginx only *proxies* to the app — it never reads files under `/opt` — so there
are no file contexts to change. The one requirement is
`httpd_can_network_connect`, which the PhoneSystem portal already needs and the
installer turns on if it is off. The nginx file is written inside `conf.d` and
renamed into place so it carries the right label.

## If the installer reports a conflict

The installer only switches off a file when **every** server block in it belongs
to `cloudpathway.org` (or `www.cloudpathway.org`). Anything else is reported,
and nothing is changed:

| Message | Fix |
| --- | --- |
| *the server block for cloudpathway.org also answers for portal…* | split it into two `server` blocks with one name each |
| *this file also holds a server block for …* | move the `cloudpathway.org` blocks into their own file in `/etc/nginx/conf.d/` |
| *lives in /etc/nginx/nginx.conf, which this installer will not edit* | move that `server` block into `/etc/nginx/conf.d/cloudpathway.conf` |
| *server_name .cloudpathway.org also matches cloudpathway.org* | narrow the wildcard, or list the names it should serve |

Then `nginx -t && sudo systemctl reload nginx`, and run the dry run again.

## Behind Cloudflare

If `cloudpathway.org` is proxied by Cloudflare (orange cloud) rather than
pointing straight at this server, nginx sees Cloudflare's addresses, not the
visitor's, so the form rate limit applies per Cloudflare edge instead of per
visitor. Add `set_real_ip_from` for Cloudflare's ranges with
`real_ip_header CF-Connecting-IP` to fix that. (When this was written,
`cloudpathway.org` resolved directly to the server, so this likely does not
apply.)

## Troubleshooting

| Symptom | Look at |
| --- | --- |
| 502 from nginx | `journalctl -u cloudpathway-web -n 50`; if the app is healthy (`status`), it is SELinux: `sudo ausearch -m AVC -ts recent` |
| forms return 500 | `status` → `db:`; the data directory must be writable by `cloudpathway` |
| applications stored but not emailed | `status` → `mail:`, then `test-mail` |
| no import button in the email | `PORTAL_URL` is empty |
| anything else | `/var/log/cloudpathway-web-deploy.log`, `/var/log/nginx/cloudpathway-web.error.log` |

`curl -s localhost:3100/api/health` on the server gives the full health report;
the same URL through nginx only ever says `{"ok":true}`.

## Where everything is

| Path | What |
| --- | --- |
| `/opt/cloudpathway-web/current` | symlink to the live release |
| `/opt/cloudpathway-web/releases/` | the last three releases |
| `/opt/cloudpathway-web/data/` | the database (service-owned, 750) |
| `/opt/cloudpathway-web/backups/` | database copies before each switch (root only) |
| `/etc/cloudpathway-web/env` | settings (root, 600) |
| `/etc/cloudpathway-web/deploy.conf` | domain, aliases and port remembered for `update` |
| `/etc/cloudpathway-web/state/` | backups of replaced nginx files, the takeover record |
| `/etc/systemd/system/cloudpathway-web.service` | the unit (rewritten on every run) |
| `/etc/nginx/conf.d/cloudpathway-web.conf` | the vhost (rewritten on every run) |
| `/var/log/cloudpathway-web-deploy.log` | every installer run |
