/**
 * Tests for the nginx takeover planner, against `nginx -T`-shaped dumps of the
 * layouts this installer is likely to meet. Run: node deploy/test/nginx-plan.test.mjs
 */
import assert from "node:assert/strict";
import { plan, render } from "../lib/nginx-plan.mjs";

const OWN = "/etc/nginx/conf.d/cloudpathway-web.conf";
const dump = (files) => Object.entries(files).map(([p, t]) => `# configuration file ${p}:\n${t}\n`).join("\n");

// EL10's stock nginx.conf: conf.d is included BEFORE its own catch-all server,
// so conf.d servers come first in processing order. No default_server.
const EL_NGINX_CONF = `
user nginx;
events { worker_connections 1024; }
http {
    include /etc/nginx/mime.types;
    include /etc/nginx/conf.d/*.conf;
    server {
        listen       80;
        listen       [::]:80;
        server_name  _;
        root         /usr/share/nginx/html;
    }
}`;

// The operator's real host, per PhoneSystem docs/cloudflare-tunnel.md §9b:
// cloudflared -> http://127.0.0.1:80, a 444 catch-all, the site, the portal.
const TUNNEL_CATCHALL = `server { listen 80 default_server; server_name _; return 444; }`;
const TUNNEL_SITE = `
server {
    listen 80;
    server_name cloudpathway.org www.cloudpathway.org;
    root  /var/www/cloudpathway/templatemo_534_parallo;
    index index.html;
    location / { try_files $uri $uri/ =404; }
}`;
const TUNNEL_PORTAL = `
server {
    listen 80;
    server_name portal.cloudpathway.org;
    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
    }
}`;

const CERTBOT_SITE = `
server {
    server_name cloudpathway.org www.cloudpathway.org;
    root /var/www/cloudpathway;
    location ^~ /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    listen [::]:443 ssl ipv6only=on; # managed by Certbot
    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/cloudpathway.org/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/cloudpathway.org/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
}
server {
    if ($host = cloudpathway.org) { return 301 https://$host$request_uri; } # managed by Certbot
    listen 80;
    listen [::]:80;
    server_name cloudpathway.org www.cloudpathway.org;
    return 404; # managed by Certbot
}`;
const LE_OPTIONS = `ssl_session_cache shared:le_nginx_SSL:10m;\nssl_protocols TLSv1.2 TLSv1.3;`;

const PORTAL_TLS = `
server { listen 80; server_name portal.cloudpathway.org; return 301 https://$host$request_uri; }
server {
    listen 443 ssl;
    server_name portal.cloudpathway.org;
    ssl_certificate     /etc/letsencrypt/live/portal.cloudpathway.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/portal.cloudpathway.org/privkey.pem;
    location / { proxy_pass http://127.0.0.1:4000; }
}
upstream something { server 127.0.0.1:9000; }`;

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };
const opts = { domain: "cloudpathway.org", ownFile: OWN };

/* ---------------- the operator's real host ---------------- */

test("REAL HOST (tunnel): disable only website.conf; HTTP-only; nothing becomes a new default", () => {
  const p = plan(dump({
    "/etc/nginx/nginx.conf": EL_NGINX_CONF,
    "/etc/nginx/conf.d/00-catchall.conf": TUNNEL_CATCHALL,
    "/etc/nginx/conf.d/portal.conf": TUNNEL_PORTAL,
    "/etc/nginx/conf.d/website.conf": TUNNEL_SITE,
  }), opts);
  assert.deepEqual(p.conflicts, []);
  assert.deepEqual(p.toDisable, [{ path: "/etc/nginx/conf.d/website.conf", kind: "confd" }]);
  assert.deepEqual(p.aliases, ["www.cloudpathway.org"]);
  assert.equal(p.oldServedHttps, false);
  assert.equal(p.tls, null);
  assert.equal(p.defaultImpact["80"], null, "the explicit 444 default_server keeps :80's default");
});

test("REAL HOST: tunnel render — no redirect to https for the apex, real IP from CF-Connecting-IP, no :443, no HSTS", () => {
  const p = plan(dump({
    "/etc/nginx/nginx.conf": EL_NGINX_CONF,
    "/etc/nginx/conf.d/00-catchall.conf": TUNNEL_CATCHALL,
    "/etc/nginx/conf.d/portal.conf": TUNNEL_PORTAL,
    "/etc/nginx/conf.d/website.conf": TUNNEL_SITE,
  }), opts);
  const out = render(p, { port: 3100, nginxVersion: "1.26.3", mode: "tunnel" });
  const apex = out.slice(out.lastIndexOf("server {"));
  assert.doesNotMatch(apex, /return 30[12]/, "a redirect in the apex block loops through the tunnel");
  assert.doesNotMatch(out, /listen\s+\S*443/);
  assert.doesNotMatch(out, /Strict-Transport-Security/);
  assert.match(apex, /set_real_ip_from 127\.0\.0\.1;/);
  assert.match(apex, /real_ip_header\s+CF-Connecting-IP;/);
  assert.match(out, /server_name www\.cloudpathway\.org;\n    return 301 https:\/\/cloudpathway\.org\$request_uri;/);
  assert.doesNotMatch(out.slice(0, out.indexOf("server {")), /set_real_ip_from/, "real_ip must never be http-level (it would change the portal)");
});

test("tunnel render trusts this machine's own addresses (cloudflared may connect via the public IP), and nothing else", () => {
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF, "/etc/nginx/conf.d/00-catchall.conf": TUNNEL_CATCHALL,
    "/etc/nginx/conf.d/website.conf": TUNNEL_SITE }), { domain: "info.cloudpathway.org", ownFile: OWN });
  p.localAddresses = ["207.90.216.140", "10.0.0.5", "fe80::1", "127.0.0.1", "1.2.3.4; evil", "$host"];
  const out = render(p, { port: 3100, nginxVersion: "1.26.3", mode: "tunnel" });
  const lines = out.split("\n").filter((l) => l.includes("set_real_ip_from")).map((l) => l.trim());
  assert.deepEqual(lines, ["set_real_ip_from 127.0.0.1;", "set_real_ip_from ::1;", "set_real_ip_from 207.90.216.140;",
    "set_real_ip_from 10.0.0.5;", "set_real_ip_from fe80::1;"]);
});

test("--domain info.cloudpathway.org: the apex site is left alone, and the new file answers only info", () => {
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF, "/etc/nginx/conf.d/00-catchall.conf": TUNNEL_CATCHALL,
    "/etc/nginx/conf.d/portal.conf": TUNNEL_PORTAL, "/etc/nginx/conf.d/website.conf": TUNNEL_SITE }),
    { domain: "info.cloudpathway.org", ownFile: OWN });
  assert.deepEqual(p.conflicts, []);
  assert.deepEqual(p.toDisable, []);
  assert.equal(p.source, "none");
  assert.deepEqual(p.aliases, []);
  const out = render(p, { port: 3100, nginxVersion: "1.26.3", mode: "tunnel" });
  const names = [...out.matchAll(/server_name\s+([^;]+);/g)].map((m) => m[1]);
  assert.deepEqual(names, ["info.cloudpathway.org"]);
  assert.doesNotMatch(out, /default_server/);
});

test("served directories are reported (root and alias, any level), so a checkout inside one can be flagged", () => {
  const p = plan(dump({
    "/etc/nginx/nginx.conf": EL_NGINX_CONF.replace("root         /usr/share/nginx/html;", "root /usr/share/nginx/html/;"),
    "/etc/nginx/conf.d/info.conf": "server { listen 80; server_name info.cloudpathway.org; root /usr/share/nginx/html/Cloudpathway_website; location /docs/ { alias /srv/docs/; } location /x { root $document_root/x; } }",
  }), { domain: "info.cloudpathway.org", ownFile: OWN });
  assert.deepEqual(p.servedDirs.map((r) => [r.path, r.directive]), [
    ["/usr/share/nginx/html/Cloudpathway_website", "root"], ["/srv/docs", "alias"], ["/usr/share/nginx/html", "root"]]);
  assert.deepEqual(p.toDisable, [{ path: "/etc/nginx/conf.d/info.conf", kind: "confd" }]);
});

/* ---------------- takeover safety ---------------- */

test("certbot-managed site beside the portal: disable only the site's file, keep its cert (via its include)", () => {
  const p = plan(dump({
    "/etc/nginx/nginx.conf": EL_NGINX_CONF,
    "/etc/nginx/conf.d/cloudpathway.conf": CERTBOT_SITE,
    "/etc/letsencrypt/options-ssl-nginx.conf": LE_OPTIONS,
    "/etc/nginx/conf.d/portal.conf": PORTAL_TLS,
  }), opts);
  assert.deepEqual(p.conflicts, []);
  assert.deepEqual(p.toDisable, [{ path: "/etc/nginx/conf.d/cloudpathway.conf", kind: "confd" }]);
  assert.equal(p.tls.certs[0].cert, "/etc/letsencrypt/live/cloudpathway.org/fullchain.pem");
  assert.equal(p.tls.includesLeOptions, true);
  assert.equal(p.oldServedHttps, true);
  assert.equal(p.acmeRoot, "/var/www/letsencrypt");
  assert.equal(p.ipv6["443"], true);
});

test("one file holding the site AND the portal: conflict, nothing disabled", () => {
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF, "/etc/nginx/conf.d/all.conf": CERTBOT_SITE + PORTAL_TLS }), opts);
  assert.equal(p.toDisable.length, 0);
  assert.ok(p.conflicts.some((c) => /portal\.cloudpathway\.org/.test(c.reason)));
});

test("a block answering for the domain and the portal together: conflict", () => {
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF,
    "/etc/nginx/conf.d/shared.conf": `server { listen 80; server_name cloudpathway.org portal.cloudpathway.org; root /x; }` }), opts);
  assert.equal(p.toDisable.length, 0);
  assert.match(p.conflicts[0].reason, /also answers for portal\.cloudpathway\.org/);
});

test("the site configured inside nginx.conf itself: conflict, never edit nginx.conf", () => {
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF.replace("server_name  _;", "server_name  cloudpathway.org;") }), opts);
  assert.equal(p.toDisable.length, 0);
  assert.match(p.conflicts[0].reason, /will not edit/);
});

test("a file that also sets http-level directives (map, upstream…): conflict, others may rely on them", () => {
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF,
    "/etc/nginx/conf.d/website.conf": `map $http_upgrade $conn { default upgrade; }\n${TUNNEL_SITE}` }), opts);
  assert.equal(p.toDisable.length, 0);
  assert.match(p.conflicts[0].reason, /sets map at http level/);
});

test("a wildcard .cloudpathway.org elsewhere also matches the apex: conflict", () => {
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF,
    "/etc/nginx/conf.d/catchall.conf": `server { listen 80; server_name .cloudpathway.org; root /x; }` }), opts);
  assert.match(p.conflicts[0].reason, /also matches cloudpathway\.org/);
});

test("PCRE-only regex syntax is evaluated, not treated as a false conflict", () => {
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF,
    "/etc/nginx/conf.d/x.conf": `server { listen 80; server_name ~^(?P<sub>[a-z]+)\\.example\\.net$; root /x; }` }), opts);
  assert.deepEqual(p.conflicts, []);
});

test("www in a block of its own, with its OWN certificate: taken over, and that certificate kept for www", () => {
  const site = `
server { listen 443 ssl; server_name cloudpathway.org; ssl_certificate /apex.pem; ssl_certificate_key /apex.key; root /x; }
server { listen 443 ssl; server_name www.cloudpathway.org; ssl_certificate /www.pem; ssl_certificate_key /www.key; return 301 https://cloudpathway.org$request_uri; }`;
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF, "/etc/nginx/conf.d/site.conf": site }), opts);
  assert.deepEqual(p.conflicts, []);
  assert.equal(p.aliasTls.certs[0].cert, "/www.pem");
  const out = render(p, { port: 3100, nginxVersion: "1.26.3", mode: "tls" });
  assert.match(out, /server_name www\.cloudpathway\.org;\n    http2 on;\n    ssl_certificate     \/www\.pem;/);
});

test("Debian sites-enabled layout is recognised", () => {
  const p = plan(dump({ "/etc/nginx/nginx.conf": "events {}\nhttp { include /etc/nginx/sites-enabled/*; }",
    "/etc/nginx/sites-enabled/cloudpathway": TUNNEL_SITE }), opts);
  assert.deepEqual(p.toDisable, [{ path: "/etc/nginx/sites-enabled/cloudpathway", kind: "sites-enabled" }]);
});

/* ---------------- certificates ---------------- */

test("certificate in an included snippet is found", () => {
  const site = `server { listen 443 ssl; server_name cloudpathway.org; include /etc/nginx/snippets/cp-ssl.conf; root /x; }`;
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF, "/etc/nginx/conf.d/site.conf": site,
    "/etc/nginx/snippets/cp-ssl.conf": "ssl_certificate /etc/pki/tls/certs/cp.crt;\nssl_certificate_key /etc/pki/tls/private/cp.key;" }), opts);
  assert.deepEqual(p.conflicts, []);
  assert.equal(p.tls.certs[0].cert, "/etc/pki/tls/certs/cp.crt");
});

test("certificate inherited from http{} is found", () => {
  const conf = EL_NGINX_CONF.replace("include /etc/nginx/mime.types;", "include /etc/nginx/mime.types;\n    ssl_certificate /etc/pki/http.crt;\n    ssl_certificate_key /etc/pki/http.key;");
  const p = plan(dump({ "/etc/nginx/nginx.conf": conf, "/etc/nginx/conf.d/site.conf": `server { listen 443 ssl; server_name cloudpathway.org; root /x; }` }), opts);
  assert.equal(p.tls.certs[0].cert, "/etc/pki/http.crt");
  assert.equal(p.tls.from, "http");
});

test("an HTTPS site whose certificate cannot be found is a conflict, never a silent HTTP-only re-render", () => {
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF,
    "/etc/nginx/conf.d/site.conf": `server { listen 443 ssl; server_name cloudpathway.org; include /missing/snippet.conf; root /x; }` }), opts);
  assert.ok(p.conflicts.some((c) => /serves HTTPS but its certificate could not be found/.test(c.reason)));
});

test("RSA + ECDSA certificate pairs are both kept", () => {
  const site = `server { listen 443 ssl; server_name cloudpathway.org;
    ssl_certificate /rsa.pem; ssl_certificate_key /rsa.key; ssl_certificate /ec.pem; ssl_certificate_key /ec.key; root /x; }`;
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF, "/etc/nginx/conf.d/site.conf": site }), opts);
  assert.equal(p.tls.certs.length, 2);
  const out = render(p, { port: 3100, nginxVersion: "1.26.3", mode: "tls" });
  assert.match(out, /\/rsa\.pem;[\s\S]*\/ec\.pem;/);
});

/* ---------------- default server (#2) ---------------- */

test("EL layout, portal.conf sorts after the managed file and nobody is default_server: :443 default would move to the website", () => {
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF,
    "/etc/nginx/conf.d/portal.conf": PORTAL_TLS, "/etc/nginx/conf.d/website.conf": CERTBOT_SITE.replace(/listen \[::\]:\d+[^;]*;/g, ""),
    "/etc/letsencrypt/options-ssl-nginx.conf": LE_OPTIONS }), opts);
  assert.ok(p.defaultImpact["443"], "must report the change");
  assert.equal(p.defaultImpact["443"].file, "/etc/nginx/conf.d/portal.conf");
});

test("…but not when the portal (or a catch-all) is explicitly default_server", () => {
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF,
    "/etc/nginx/conf.d/portal.conf": PORTAL_TLS.replace("listen 443 ssl;", "listen 443 ssl default_server;").replace("listen 80;", "listen 80 default_server;"),
    "/etc/nginx/conf.d/website.conf": CERTBOT_SITE, "/etc/letsencrypt/options-ssl-nginx.conf": LE_OPTIONS }), opts);
  assert.equal(p.defaultImpact["443"], null);
  assert.equal(p.defaultImpact["80"], null);
});

test("…and not when the old site was already the default (it sorted first)", () => {
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF,
    "/etc/nginx/conf.d/a-website.conf": CERTBOT_SITE, "/etc/nginx/conf.d/portal.conf": PORTAL_TLS,
    "/etc/letsencrypt/options-ssl-nginx.conf": LE_OPTIONS }), opts);
  assert.equal(p.defaultImpact["443"], null);
});

test("no new IPv6 socket for a site that had none (source none, v6 only on :80 elsewhere)", () => {
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF }), opts);
  assert.equal(p.ipv6["443"], false);
});

/* ---------------- listens ---------------- */

test("0.0.0.0 is the wildcard: mixed `listen 0.0.0.0:443` and `listen 443` render one listen", () => {
  const site = `server { listen 0.0.0.0:443 ssl; listen 443 ssl; server_name cloudpathway.org; ssl_certificate /c; ssl_certificate_key /k; }`;
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF, "/etc/nginx/conf.d/site.conf": site }), opts);
  assert.deepEqual(p.listenHosts["443"], [""]);
  // No aliases here, so one :443 block — and exactly one listen in it, not a duplicate that fails nginx -t.
  assert.equal((render(p, { port: 3100, nginxVersion: "1.26.3", mode: "tls" }).match(/listen 443 ssl;/g) || []).length, 1);
});

test("an old site bound to a specific IP keeps that address", () => {
  const site = `server { listen 207.90.216.22:443 ssl; server_name cloudpathway.org; ssl_certificate /c; ssl_certificate_key /k; }`;
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF, "/etc/nginx/conf.d/site.conf": site }), opts);
  assert.deepEqual(p.listenHosts["443"], ["207.90.216.22"]);
});

test("extra ports on the old site are reported, not silently dropped", () => {
  const site = `server { listen 80; listen 8080; server_name cloudpathway.org; root /x; }`;
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF, "/etc/nginx/conf.d/site.conf": site }), opts);
  assert.ok(p.warnings.some((w) => /8080/.test(w)));
});

test("default_server on the old site's listen is carried over", () => {
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF,
    "/etc/nginx/conf.d/site.conf": `server { listen 80 default_server; server_name cloudpathway.org; root /x; }` }), opts);
  assert.equal(p.defaultServer[80], true);
  assert.match(render(p, { port: 3100, nginxVersion: "1.26.3", mode: "http" }), /listen 80 default_server;/);
});

/* ---------------- re-runs and rendering ---------------- */

test("re-run (tls): old site disabled, our own file supplies cert, aliases and listens; byte-identical", () => {
  const files = { "/etc/nginx/nginx.conf": EL_NGINX_CONF, "/etc/nginx/conf.d/cloudpathway.conf": CERTBOT_SITE,
    "/etc/letsencrypt/options-ssl-nginx.conf": LE_OPTIONS, "/etc/nginx/conf.d/portal.conf": PORTAL_TLS.replace(/listen 443 ssl;/, "listen 443 ssl default_server;") };
  const first = plan(dump(files), opts);
  const replaced = first.toDisable.map((d) => d.path);
  const o = { port: 3100, nginxVersion: "1.26.3", mode: "tls", leOptions: "/etc/letsencrypt/options-ssl-nginx.conf", replaced };
  const ours = render(first, o);
  delete files["/etc/nginx/conf.d/cloudpathway.conf"];
  const again = plan(dump({ ...files, [OWN]: ours }), opts);
  assert.deepEqual(again.conflicts, []);
  assert.equal(again.source, "previous-install");
  assert.equal(again.tls.certs[0].cert, first.tls.certs[0].cert);
  assert.deepEqual(again.aliases, first.aliases);
  assert.equal(render(again, o), ours);
});

test("re-run (tunnel): byte-identical, still no :443", () => {
  const files = { "/etc/nginx/nginx.conf": EL_NGINX_CONF, "/etc/nginx/conf.d/00-catchall.conf": TUNNEL_CATCHALL,
    "/etc/nginx/conf.d/portal.conf": TUNNEL_PORTAL, "/etc/nginx/conf.d/website.conf": TUNNEL_SITE };
  const first = plan(dump(files), opts);
  const o = { port: 3100, nginxVersion: "1.26.3", mode: "tunnel", replaced: ["/etc/nginx/conf.d/website.conf"] };
  const ours = render(first, o);
  delete files["/etc/nginx/conf.d/website.conf"];
  const again = plan(dump({ ...files, [OWN]: ours }), opts);
  assert.equal(again.source, "previous-install");
  assert.deepEqual(again.conflicts, []);
  assert.equal(render(again, o), ours);
});

test("render: HTTP/2 only where it can be scoped to this site", () => {
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF, "/etc/nginx/conf.d/c.conf": CERTBOT_SITE,
    "/etc/letsencrypt/options-ssl-nginx.conf": LE_OPTIONS }), opts);
  assert.match(render(p, { port: 3100, nginxVersion: "1.26.3", mode: "tls" }), /http2 on;/);
  assert.doesNotMatch(render(p, { port: 3100, nginxVersion: "1.24.0", mode: "tls" }), /http2/);
});

test("render: tls mode refuses to run without a certificate", () => {
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF }), opts);
  assert.throws(() => render(p, { port: 3100, nginxVersion: "1.26.3", mode: "tls" }), /needs a certificate/);
});

test("render: HSTS in tls mode by default, and not when the certificate cannot renew itself", () => {
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF, "/etc/nginx/conf.d/c.conf": CERTBOT_SITE,
    "/etc/letsencrypt/options-ssl-nginx.conf": LE_OPTIONS }), opts);
  assert.match(render(p, { port: 3100, nginxVersion: "1.26.3", mode: "tls" }), /Strict-Transport-Security/);
  const off = render(p, { port: 3100, nginxVersion: "1.26.3", mode: "tls", hsts: false });
  assert.doesNotMatch(off, /Strict-Transport-Security/);
  assert.match(off, /return 301 https:\/\/cloudpathway\.org\$request_uri;/); // still TLS, just no HSTS
});

test("render blocks the unused image optimizer in every mode", () => {
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF, "/etc/nginx/conf.d/c.conf": CERTBOT_SITE,
    "/etc/letsencrypt/options-ssl-nginx.conf": LE_OPTIONS }), opts);
  for (const mode of ["tls", "http", "tunnel"]) assert.match(render(p, { port: 3100, nginxVersion: "1.26.3", mode }), /location \^~ \/_next\/image \{\s*return 404;/);
});

test("render always sets X-Real-IP (the health endpoint's privacy depends on it), in every mode", () => {
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF, "/etc/nginx/conf.d/c.conf": CERTBOT_SITE,
    "/etc/letsencrypt/options-ssl-nginx.conf": LE_OPTIONS }), opts);
  for (const mode of ["tls", "http", "tunnel"]) assert.match(render(p, { port: 3100, nginxVersion: "1.26.3", mode }), /proxy_set_header\s+X-Real-IP\s+\$remote_addr;/);
});

console.log(`\n${passed} planner tests passed`);
