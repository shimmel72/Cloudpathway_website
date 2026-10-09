/**
 * Tests for the nginx takeover planner, against `nginx -T`-shaped dumps of the
 * layouts this installer is likely to meet. Run: node deploy/test/nginx-plan.test.mjs
 */
import assert from "node:assert/strict";
import { plan, render } from "../lib/nginx-plan.mjs";

const OWN = "/etc/nginx/conf.d/cloudpathway-web.conf";
const dump = (files) => Object.entries(files).map(([p, t]) => `# configuration file ${p}:\n${t}\n`).join("\n");

// EL10's stock nginx.conf: a catch-all default server, conf.d included in http{}.
const EL_NGINX_CONF = `
user nginx;
worker_processes auto;
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

const CERTBOT_SITE = `
server {
    server_name cloudpathway.org www.cloudpathway.org;
    root /var/www/cloudpathway;
    index index.html;
    location ^~ /.well-known/acme-challenge/ { root /var/www/letsencrypt; }

    listen [::]:443 ssl ipv6only=on; # managed by Certbot
    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/cloudpathway.org/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/cloudpathway.org/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
}
server {
    if ($host = www.cloudpathway.org) {
        return 301 https://$host$request_uri;
    } # managed by Certbot
    if ($host = cloudpathway.org) {
        return 301 https://$host$request_uri;
    } # managed by Certbot
    listen 80;
    listen [::]:80;
    server_name cloudpathway.org www.cloudpathway.org;
    return 404; # managed by Certbot
}`;

const PORTAL = `
server {
    listen 80;
    server_name portal.cloudpathway.org;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl http2;
    server_name portal.cloudpathway.org;
    ssl_certificate     /etc/letsencrypt/live/portal.cloudpathway.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/portal.cloudpathway.org/privkey.pem;
    location / { proxy_pass http://127.0.0.1:4000; }
}
upstream something { server 127.0.0.1:9000; }`;

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

test("certbot-managed site beside the portal: disable only the site's file, keep its cert", () => {
  const p = plan(dump({
    "/etc/nginx/nginx.conf": EL_NGINX_CONF,
    "/etc/nginx/conf.d/cloudpathway.conf": CERTBOT_SITE,
    "/etc/nginx/conf.d/portal.conf": PORTAL,
  }), { domain: "cloudpathway.org", ownFile: OWN });
  assert.deepEqual(p.conflicts, []);
  assert.deepEqual(p.toDisable, [{ path: "/etc/nginx/conf.d/cloudpathway.conf", kind: "confd" }]);
  assert.deepEqual(p.aliases, ["www.cloudpathway.org"]);
  assert.equal(p.tls.cert, "/etc/letsencrypt/live/cloudpathway.org/fullchain.pem");
  assert.equal(p.tls.includesLeOptions, true);
  assert.equal(p.acmeRoot, "/var/www/letsencrypt");
  assert.equal(p.ipv6, true);
  assert.equal(p.source, "existing-site");
  assert.ok(!p.toDisable.some((d) => d.path.includes("portal")), "portal must never be touched");
});

test("one file holding the site AND the portal: conflict, nothing disabled", () => {
  const p = plan(dump({
    "/etc/nginx/nginx.conf": EL_NGINX_CONF,
    "/etc/nginx/conf.d/all-sites.conf": CERTBOT_SITE + PORTAL,
  }), { domain: "cloudpathway.org", ownFile: OWN });
  assert.equal(p.toDisable.length, 0);
  assert.equal(p.conflicts.length, 1);
  assert.match(p.conflicts[0].reason, /portal\.cloudpathway\.org/);
});

test("a block answering for the domain and the portal together: conflict", () => {
  const p = plan(dump({
    "/etc/nginx/nginx.conf": EL_NGINX_CONF,
    "/etc/nginx/conf.d/shared.conf": `server { listen 80; server_name cloudpathway.org portal.cloudpathway.org; root /x; }`,
  }), { domain: "cloudpathway.org", ownFile: OWN });
  assert.equal(p.toDisable.length, 0);
  assert.match(p.conflicts[0].reason, /also answers for portal\.cloudpathway\.org/);
});

test("the site configured inside nginx.conf itself: conflict, never edit nginx.conf", () => {
  const conf = EL_NGINX_CONF.replace("server_name  _;", "server_name  cloudpathway.org;");
  const p = plan(dump({ "/etc/nginx/nginx.conf": conf }), { domain: "cloudpathway.org", ownFile: OWN });
  assert.equal(p.toDisable.length, 0);
  assert.match(p.conflicts[0].reason, /will not edit/);
});

test("old site served only by the catch-all default server: nothing to disable, no conflict", () => {
  const p = plan(dump({
    "/etc/nginx/nginx.conf": EL_NGINX_CONF,
    "/etc/nginx/conf.d/portal.conf": PORTAL,
  }), { domain: "cloudpathway.org", ownFile: OWN });
  assert.deepEqual(p.conflicts, []);
  assert.deepEqual(p.toDisable, []);
  assert.equal(p.tls, null);
  assert.equal(p.source, "none");
});

test("a wildcard .cloudpathway.org elsewhere also matches the apex: conflict", () => {
  const p = plan(dump({
    "/etc/nginx/nginx.conf": EL_NGINX_CONF,
    "/etc/nginx/conf.d/catchall.conf": `server { listen 80; server_name .cloudpathway.org; root /x; }`,
  }), { domain: "cloudpathway.org", ownFile: OWN });
  assert.match(p.conflicts[0].reason, /also matches cloudpathway\.org/);
});

test("www in a block of its own, in the same file: taken over with the domain", () => {
  const site = `
server { listen 443 ssl; server_name cloudpathway.org; ssl_certificate /c.pem; ssl_certificate_key /k.pem; root /x; }
server { listen 443 ssl; server_name www.cloudpathway.org; ssl_certificate /c.pem; ssl_certificate_key /k.pem; return 301 https://cloudpathway.org$request_uri; }`;
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF, "/etc/nginx/conf.d/site.conf": site }),
    { domain: "cloudpathway.org", ownFile: OWN });
  assert.deepEqual(p.conflicts, []);
  assert.equal(p.toDisable.length, 1);
  assert.deepEqual(p.aliases, ["www.cloudpathway.org"]);
});

test("Debian sites-enabled layout is recognised", () => {
  const p = plan(dump({
    "/etc/nginx/nginx.conf": "http { include /etc/nginx/sites-enabled/*; }",
    "/etc/nginx/sites-enabled/cloudpathway": CERTBOT_SITE,
  }), { domain: "cloudpathway.org", ownFile: OWN });
  assert.deepEqual(p.toDisable, [{ path: "/etc/nginx/sites-enabled/cloudpathway", kind: "sites-enabled" }]);
});

test("re-run: old site already disabled, our own file supplies cert, aliases and listens", () => {
  const first = plan(dump({
    "/etc/nginx/nginx.conf": EL_NGINX_CONF,
    "/etc/nginx/conf.d/cloudpathway.conf": CERTBOT_SITE,
    "/etc/nginx/conf.d/portal.conf": PORTAL,
  }), { domain: "cloudpathway.org", ownFile: OWN });
  const replaced = first.toDisable.map((d) => d.path);
  const ours = render(first, { port: 3100, nginxVersion: "1.26.3", leOptions: "/etc/letsencrypt/options-ssl-nginx.conf", replaced });
  const again = plan(dump({
    "/etc/nginx/nginx.conf": EL_NGINX_CONF,
    [OWN]: ours,
    "/etc/nginx/conf.d/portal.conf": PORTAL,
  }), { domain: "cloudpathway.org", ownFile: OWN });
  assert.deepEqual(again.conflicts, []);
  assert.deepEqual(again.toDisable, []);
  assert.equal(again.source, "previous-install");
  assert.ok(again.tls, "TLS must survive a re-run");
  assert.equal(again.tls.cert, first.tls.cert);
  assert.deepEqual(again.aliases, first.aliases);
  assert.equal(again.acmeRoot, first.acmeRoot);
  assert.equal(again.ipv6, first.ipv6);
  // and rendering it again is byte-identical: re-runs are idempotent
  assert.equal(render(again, { port: 3100, nginxVersion: "1.26.3", leOptions: "/etc/letsencrypt/options-ssl-nginx.conf", replaced }), ours);
});

test("default_server on the old site's listen is carried over", () => {
  const site = `server { listen 80 default_server; server_name cloudpathway.org; root /x; }`;
  const p = plan(dump({ "/etc/nginx/nginx.conf": "http { include /etc/nginx/conf.d/*.conf; }", "/etc/nginx/conf.d/site.conf": site }),
    { domain: "cloudpathway.org", ownFile: OWN });
  assert.equal(p.defaultServer[80], true);
  assert.match(render(p, { port: 3100, nginxVersion: "1.26.3" }), /listen 80 default_server;/);
});

test("an old site bound to a specific IP keeps that address", () => {
  const site = `server { listen 207.90.216.22:443 ssl; server_name cloudpathway.org; ssl_certificate /c; ssl_certificate_key /k; }`;
  const p = plan(dump({ "/etc/nginx/nginx.conf": "", "/etc/nginx/conf.d/site.conf": site }),
    { domain: "cloudpathway.org", ownFile: OWN });
  assert.deepEqual(p.listenHosts[443], ["207.90.216.22"]);
  assert.match(render(p, { port: 3100, nginxVersion: "1.26.3" }), /listen 207\.90\.216\.22:443 ssl;/);
});

test("render: HTTP/2 only where it can be scoped to this site (never a socket-wide listen flag)", () => {
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF, "/etc/nginx/conf.d/c.conf": CERTBOT_SITE }),
    { domain: "cloudpathway.org", ownFile: OWN });
  const modern = render(p, { port: 3100, nginxVersion: "1.26.3" });
  const old = render(p, { port: 3100, nginxVersion: "1.24.0" });
  assert.match(modern, /http2 on;/); assert.doesNotMatch(modern, /ssl http2/);
  assert.doesNotMatch(old, /http2/, "on nginx < 1.25.1 enabling HTTP/2 would change the portal's socket too");
});

test("render without a certificate: plain HTTP, forwarded-proto map, no HSTS", () => {
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF }), { domain: "cloudpathway.org", aliases: ["www.cloudpathway.org"], ownFile: OWN });
  const out = render(p, { port: 3100, nginxVersion: "1.26.3" });
  assert.doesNotMatch(out, /listen 443/);
  assert.doesNotMatch(out, /Strict-Transport-Security/);
  assert.match(out, /map \$http_x_forwarded_proto \$cloudpathway_forwarded_proto/);
  assert.match(out, /server_name www\.cloudpathway\.org;\n    return 301 \$cloudpathway_forwarded_proto:\/\/cloudpathway\.org/);
});

test("render always sets X-Real-IP (the health endpoint's privacy depends on it)", () => {
  const p = plan(dump({ "/etc/nginx/nginx.conf": EL_NGINX_CONF, "/etc/nginx/conf.d/c.conf": CERTBOT_SITE }),
    { domain: "cloudpathway.org", ownFile: OWN });
  for (const v of ["1.24.0", "1.26.3"]) assert.match(render(p, { port: 3100, nginxVersion: v }), /proxy_set_header\s+X-Real-IP\s+\$remote_addr;/);
});

console.log(`\n${passed} planner tests passed`);
