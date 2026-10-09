#!/usr/bin/env node
/**
 * Reads `nginx -T` and decides how to hand a domain to the Cloudpathway site.
 *
 *   nginx -T 2>/dev/null | node nginx-plan.mjs plan   --domain D [--alias A]... --own-file F
 *   node nginx-plan.mjs render --plan plan.json --port P --nginx-version 1.26.3
 *
 * The plan is deliberately conservative. A file is only disabled when every
 * server block in it belongs to the domain being taken over (the domain itself,
 * or its www. twin). Anything else — a block that also answers for the portal,
 * a file that holds another site's block too, the domain configured inside
 * nginx.conf — is reported as a conflict and nothing is changed. Taking over a
 * website must never be able to take down the phone system next to it.
 */
import fs from "node:fs";

/* ------------------------------------------------------------------------ */
/* Parsing                                                                  */
/* ------------------------------------------------------------------------ */

/** Split `nginx -T` output into { path, text } per configuration file. */
export function splitFiles(dump) {
  const files = [];
  const re = /^# configuration file (.+):\s*$/gm;
  const marks = [];
  let m;
  while ((m = re.exec(dump))) marks.push({ path: m[1], start: m.index, bodyStart: re.lastIndex });
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].start : dump.length;
    files.push({ path: marks[i].path, text: dump.slice(marks[i].bodyStart, end) });
  }
  return files;
}

/** nginx tokens: words, quoted strings, braces, semicolons. Comments dropped. */
export function tokenize(text) {
  const tokens = [];
  let i = 0;
  let line = 1;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === "\n") { line++; i++; continue; }
    if (c === " " || c === "\t" || c === "\r") { i++; continue; }
    if (c === "#") { while (i < n && text[i] !== "\n") i++; continue; }
    if (c === "{" || c === "}" || c === ";") { tokens.push({ t: c, line }); i++; continue; }
    if (c === '"' || c === "'") {
      const q = c; let j = i + 1; let v = "";
      while (j < n && text[j] !== q) {
        if (text[j] === "\\" && j + 1 < n) { v += text[j + 1]; j += 2; continue; }
        if (text[j] === "\n") line++;
        v += text[j]; j++;
      }
      tokens.push({ t: "word", v, line }); i = j + 1; continue;
    }
    let j = i; let v = "";
    while (j < n && !/[\s;{}]/.test(text[j])) {
      // `#` only starts a comment at the beginning of a token.
      v += text[j]; j++;
    }
    tokens.push({ t: "word", v, line }); i = j;
  }
  return tokens;
}

/** Tokens -> directive tree: { name, args, line, block?: [...] }. */
export function parse(tokens) {
  let pos = 0;
  function list(depth) {
    const out = [];
    while (pos < tokens.length) {
      const tk = tokens[pos];
      if (tk.t === "}") { if (depth > 0) { pos++; return out; } pos++; continue; }
      if (tk.t !== "word") { pos++; continue; }
      const d = { name: tk.v, args: [], line: tk.line };
      pos++;
      while (pos < tokens.length && tokens[pos].t === "word") { d.args.push(tokens[pos].v); pos++; }
      if (pos < tokens.length && tokens[pos].t === "{") { pos++; d.block = list(depth + 1); }
      else if (pos < tokens.length && tokens[pos].t === ";") pos++;
      out.push(d);
    }
    return out;
  }
  return list(0);
}

/** Every http `server { }` block in a file, with what matters about it. */
export function serverBlocks(tree, filePath) {
  const found = [];
  function walk(nodes, chain) {
    for (const d of nodes) {
      if (!d.block) continue;
      const inStream = chain.includes("stream") || /\/stream(\.d)?\//.test(filePath);
      if (d.name === "server" && !chain.includes("upstream") && !inStream) {
        found.push(describe(d));
        continue;
      }
      walk(d.block, [...chain, d.name]);
    }
  }
  walk(tree, []);
  return found;
}

function describe(server) {
  const names = [];
  const listens = [];
  let cert = null;
  let key = null;
  let acmeRoot = null;
  let includesLeOptions = false;
  for (const d of server.block) {
    if (d.name === "server_name") names.push(...d.args.map((s) => s.toLowerCase()));
    if (d.name === "listen") listens.push(parseListen(d.args));
    if (d.name === "ssl_certificate" && !cert) cert = d.args[0] ?? null;
    if (d.name === "ssl_certificate_key" && !key) key = d.args[0] ?? null;
    if (d.name === "include" && /options-ssl-nginx\.conf$/.test(d.args[0] ?? "")) includesLeOptions = true;
    if (d.name === "location" && d.block && d.args.some((a) => a.includes("/.well-known/acme-challenge"))) {
      const root = d.block.find((x) => x.name === "root");
      if (root) acmeRoot = root.args[0];
    }
  }
  return { line: server.line, names, listens, cert, key, acmeRoot, includesLeOptions };
}

function parseListen(args) {
  const [addr = "80", ...flags] = args;
  let host = "";
  let port = addr;
  const v6 = /^\[([^\]]*)\](?::(\d+))?$/.exec(addr);
  if (v6) { host = `[${v6[1]}]`; port = v6[2] ?? "80"; }
  else if (addr.includes(":")) { const i = addr.lastIndexOf(":"); host = addr.slice(0, i); port = addr.slice(i + 1); }
  else if (!/^\d+$/.test(addr)) { host = addr; port = "80"; }
  if (host === "*") host = "";
  return {
    host,
    port: Number(port),
    ssl: flags.includes("ssl"),
    defaultServer: flags.includes("default_server") || flags.includes("default"),
    ipv6: host.startsWith("["),
  };
}

/* ------------------------------------------------------------------------ */
/* Planning                                                                 */
/* ------------------------------------------------------------------------ */

/** How a server_name entry relates to the domain. */
function nameRelation(name, domain) {
  if (name === domain) return "exact";
  if (name === `www.${domain}`) return "www";
  if (name === "_" || name === "" || name === '""') return "placeholder";
  if (name.startsWith(".") && (domain === name.slice(1) || domain.endsWith(name))) return "suffix-covers";
  if (name.startsWith("~")) {
    try { if (new RegExp(name.slice(1)).test(domain)) return "regex-covers"; } catch { return "regex-unknown"; }
    return "other";
  }
  return "other";
}

export function plan(dump, { domain, aliases = [], ownFile }) {
  domain = domain.toLowerCase();
  aliases = aliases.map((a) => a.toLowerCase()).filter((a) => a && a !== domain);
  const files = splitFiles(dump).map((f) => ({ ...f, servers: serverBlocks(parse(tokenize(f.text)), f.path) }));

  const conflicts = [];
  const targets = [];
  const wanted = new Set([domain, ...aliases]);
  const autoAliases = new Set();

  for (const f of files) {
    if (f.path === ownFile) continue;
    for (const s of f.servers) {
      const rel = s.names.map((n) => ({ n, r: nameRelation(n, domain) }));
      // www.<domain> is part of the domain, even in a block of its own (certbot
      // often writes one), and is taken over with it.
      const touches = rel.some(({ n, r }) => r === "exact" || r === "www" || wanted.has(n));
      const wildcardCovers = rel.find(({ r }) => r === "suffix-covers" || r === "regex-covers" || r === "regex-unknown");
      if (wildcardCovers && !touches) {
        conflicts.push({
          file: f.path, line: s.line,
          reason: `server_name ${wildcardCovers.n} also matches ${domain}; it cannot be split automatically`,
        });
        continue;
      }
      if (!touches) continue;
      const extras = rel.filter(({ n, r }) => !(r === "exact" || r === "placeholder" || wanted.has(n)));
      for (const { n, r } of rel) if (r === "www") autoAliases.add(n);
      const strayExtras = extras.filter(({ r }) => r !== "www");
      for (const { n, r } of extras) if (r === "www") autoAliases.add(n);
      if (strayExtras.length) {
        conflicts.push({
          file: f.path, line: s.line,
          reason: `the server block for ${domain} also answers for ${strayExtras.map((x) => x.n).join(", ")}`,
        });
        continue;
      }
      targets.push({ file: f.path, server: s });
    }
  }

  // A file can only be switched off whole, so every block in it must be ours.
  const targetFiles = [...new Set(targets.map((t) => t.file))];
  const toDisable = [];
  for (const path of targetFiles) {
    const f = files.find((x) => x.path === path);
    const allNames = new Set([domain, ...aliases, ...autoAliases]);
    const strangers = f.servers.filter(
      (s) => !s.names.some((n) => allNames.has(n) || ["exact", "www"].includes(nameRelation(n, domain))),
    );
    if (strangers.length) {
      conflicts.push({
        file: path, line: strangers[0].line,
        reason: `this file also holds a server block for ${strangers[0].names.join(" ") || "(no server_name)"}; split it before taking over ${domain}`,
      });
      continue;
    }
    let kind = null;
    if (/^\/etc\/nginx\/conf\.d\/[^/]+\.conf$/.test(path)) kind = "confd";
    else if (/^\/etc\/nginx\/sites-enabled\/[^/]+$/.test(path)) kind = "sites-enabled";
    if (!kind) {
      conflicts.push({
        file: path, line: f.servers[0]?.line ?? 0,
        reason: `the server block for ${domain} lives in ${path}, which this installer will not edit; move it to /etc/nginx/conf.d/ first`,
      });
      continue;
    }
    toDisable.push({ path, kind });
  }

  // A re-run: the old site is already disabled, so nothing is a target, and the
  // live truth about the certificate, aliases and listen addresses is in the
  // file this installer wrote last time. Without this, a plain `update` would
  // find no certificate and quietly re-render the site as HTTP-only.
  const own = files.find((f) => f.path === ownFile);
  const ownBlocks = (own?.servers ?? []).filter((s) =>
    s.names.some((n) => n === domain || wanted.has(n) || nameRelation(n, domain) === "www"));
  for (const s of ownBlocks) for (const n of s.names) if (n !== domain && n !== "_") autoAliases.add(n);
  const blocks = targets.length ? targets.map((t) => t.server) : ownBlocks;
  const tlsBlock = blocks.find((s) => s.cert && s.key && s.names.includes(domain)) ?? blocks.find((s) => s.cert && s.key);
  const anyIpv6 = files.some((f) => f.servers.some((s) => s.listens.some((l) => l.ipv6)));
  const oldListens = blocks.flatMap((s) => s.listens);
  const hosts = (port) => {
    const hs = [...new Set(oldListens.filter((l) => l.port === port && !l.ipv6).map((l) => l.host))];
    return hs.length ? hs : [""];
  };

  return {
    domain,
    aliases: [...new Set([...aliases, ...autoAliases])].sort(),
    ownFile,
    conflicts,
    toDisable,
    oldServerNames: [...new Set(targets.flatMap((t) => t.server.names))].sort(),
    source: targets.length ? "existing-site" : ownBlocks.length ? "previous-install" : "none",
    tls: tlsBlock ? { cert: tlsBlock.cert, key: tlsBlock.key, includesLeOptions: tlsBlock.includesLeOptions } : null,
    acmeRoot: blocks.map((s) => s.acmeRoot).find(Boolean) ?? null,
    defaultServer: {
      80: oldListens.some((l) => l.port === 80 && l.defaultServer),
      443: oldListens.some((l) => l.port === 443 && l.defaultServer),
    },
    listenHosts: { 80: hosts(80), 443: hosts(443) },
    ipv6: blocks.length ? oldListens.some((l) => l.ipv6) : anyIpv6,
  };
}

/* ------------------------------------------------------------------------ */
/* Rendering                                                                */
/* ------------------------------------------------------------------------ */

function versionAtLeast(v, want) {
  const a = String(v).split(".").map(Number);
  const b = want.split(".").map(Number);
  for (let i = 0; i < 3; i++) { if ((a[i] ?? 0) !== b[i]) return (a[i] ?? 0) > b[i]; }
  return true;
}

/**
 * `replaced` is what this site displaced, from the installer's saved state —
 * not p.toDisable, which is empty on a re-run because the old files are
 * already switched off. Passing it keeps the header honest and makes a
 * re-run render byte-identically.
 */
export function render(p, { port, nginxVersion, leOptions = null, generatedAt = "", replaced = null }) {
  const replacedFiles = replaced ?? p.toDisable.map((d) => d.path);
  // HTTP/2 only where it can be scoped to this site. Before nginx 1.25.1 the
  // only way to turn it on is a `listen ... http2` flag, which applies to the
  // whole address:port — every other site on :443 (the portal) would change
  // protocol too, and nginx says so with "protocol options redefined". Not
  // this installer's call to make for its neighbours.
  const http2Directive = versionAtLeast(nginxVersion, "1.25.1");
  const tls = Boolean(p.tls);
  const canonical = p.domain;
  const L = [];
  const listen = (portNo, { ssl = false, def = false } = {}) => {
    const flags = [ssl ? "ssl" : "", def ? "default_server" : ""].filter(Boolean).join(" ");
    const out = [];
    for (const h of p.listenHosts[portNo] ?? [""]) out.push(`    listen ${h ? `${h}:` : ""}${portNo}${flags ? " " + flags : ""};`);
    if (p.ipv6) out.push(`    listen [::]:${portNo}${flags ? " " + flags : ""};`);
    return out;
  };
  const sslLines = () => [
    ...(http2Directive ? ["    http2 on;"] : []),
    `    ssl_certificate     ${p.tls.cert};`,
    `    ssl_certificate_key ${p.tls.key};`,
    ...(leOptions ? [`    include ${leOptions};`] : ["    ssl_protocols TLSv1.2 TLSv1.3;"]),
  ];
  const acme = () => (p.acmeRoot
    ? [
        "    # Certificate renewals answer here (certbot webroot). Without this the",
        "    # challenge would be proxied to the site, 404, and renewal would fail",
        "    # quietly about sixty days from now.",
        "    location ^~ /.well-known/acme-challenge/ {",
        `        root ${p.acmeRoot};`,
        "        try_files $uri =404;",
        "    }",
        "",
      ]
    : []);
  const proxyBlock = (proto) => [
    "    proxy_http_version 1.1;",
    '    proxy_set_header   Connection        "";',
    "    proxy_set_header   Host              $host;",
    "    # The app shows its detailed /api/health only to requests WITHOUT this",
    "    # header, so it must always be set here, overwriting anything a client sent.",
    "    proxy_set_header   X-Real-IP         $remote_addr;",
    "    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;",
    `    proxy_set_header   X-Forwarded-Proto ${proto};`,
    "    proxy_set_header   X-Forwarded-Host  $host;",
    "",
  ];
  const headers = (hsts) => [
    ...(hsts ? ['    add_header Strict-Transport-Security "max-age=15552000" always;'] : []),
    '    add_header X-Content-Type-Options "nosniff" always;',
    '    add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
    '    add_header X-Frame-Options "SAMEORIGIN" always;',
    '    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;',
    "",
  ];
  const appLocations = () => [
    "    # Small JSON forms only.",
    "    client_max_body_size 64k;",
    "",
    "    location = /api/contact {",
    "        limit_req zone=cloudpathway_forms burst=10 nodelay;",
    "        limit_req_status 429;",
    "        proxy_pass http://cloudpathway_web;",
    "    }",
    "",
    "    location = /api/reseller-application {",
    "        limit_req zone=cloudpathway_forms burst=10 nodelay;",
    "        limit_req_status 429;",
    "        proxy_pass http://cloudpathway_web;",
    "    }",
    "",
    "    location / {",
    "        proxy_pass http://cloudpathway_web;",
    "    }",
  ];

  L.push(
    "# Cloudpathway website — managed by deploy/install.sh in the Cloudpathway_website repo.",
    "# Re-running the installer rewrites this file; edit the template, not this.",
    ...(generatedAt ? [`# Generated ${generatedAt}.`] : []),
    ...(replacedFiles.length
      ? ["#", "# Replaced (disabled, not deleted) — `install.sh restore-old-site` puts them back:", ...replacedFiles.map((f) => `#   ${f}`)]
      : []),
    "",
    "upstream cloudpathway_web {",
    `    server 127.0.0.1:${port};`,
    "    keepalive 16;",
    "    # Below Node's 5 s keep-alive, so nginx never reuses a socket the app",
    "    # has just closed (the classic intermittent 502).",
    "    keepalive_timeout 4s;",
    "}",
    "",
    "# Forms are the only thing worth throttling here; the app also limits per",
    "# email address. Generous, because behind NAT one address can be a whole office.",
    "limit_req_zone $binary_remote_addr zone=cloudpathway_forms:10m rate=20r/m;",
    "",
  );

  if (tls) {
    L.push(
      "# Plain HTTP: certificate renewals, then everything else to HTTPS on the canonical name.",
      "server {",
      ...listen(80, { def: p.defaultServer[80] }),
      `    server_name ${[canonical, ...p.aliases].join(" ")};`,
      "",
      ...acme(),
      "    location / {",
      `        return 301 https://${canonical}$request_uri;`,
      "    }",
      "}",
      "",
    );
    if (p.aliases.length) {
      L.push(
        `# ${p.aliases.join(", ")} -> ${canonical}`,
        "server {",
        ...listen(443, { ssl: true }),
        `    server_name ${p.aliases.join(" ")};`,
        ...sslLines(),
        "",
        `    return 301 https://${canonical}$request_uri;`,
        "}",
        "",
      );
    }
    L.push(
      "server {",
      ...listen(443, { ssl: true, def: p.defaultServer[443] }),
      `    server_name ${canonical};`,
      ...sslLines(),
      "",
      "    access_log /var/log/nginx/cloudpathway-web.access.log;",
      "    error_log  /var/log/nginx/cloudpathway-web.error.log;",
      "",
      ...headers(true),
      ...proxyBlock("$scheme"),
      ...acme(),
      ...appLocations(),
      "}",
      "",
    );
  } else {
    L.push(
      "# No certificate was found for this domain, so this serves plain HTTP. That is",
      "# correct behind a Cloudflare tunnel or proxy (TLS ends at Cloudflare). On a",
      "# directly reachable server, obtain a certificate and re-run the installer —",
      "# docs/deploy.md, \"TLS\" — and this block becomes HTTPS with a redirect.",
      "map $http_x_forwarded_proto $cloudpathway_forwarded_proto {",
      "    default $http_x_forwarded_proto;",
      '    ""      $scheme;',
      "}",
      "",
    );
    if (p.aliases.length) {
      L.push(
        "server {",
        ...listen(80),
        `    server_name ${p.aliases.join(" ")};`,
        `    return 301 $cloudpathway_forwarded_proto://${canonical}$request_uri;`,
        "}",
        "",
      );
    }
    L.push(
      "server {",
      ...listen(80, { def: p.defaultServer[80] }),
      `    server_name ${canonical};`,
      "",
      "    access_log /var/log/nginx/cloudpathway-web.access.log;",
      "    error_log  /var/log/nginx/cloudpathway-web.error.log;",
      "",
      ...headers(false),
      ...proxyBlock("$cloudpathway_forwarded_proto"),
      ...acme(),
      ...appLocations(),
      "}",
      "",
    );
  }
  return L.join("\n");
}

/* ------------------------------------------------------------------------ */
/* CLI                                                                      */
/* ------------------------------------------------------------------------ */

function argv(name, all = false) {
  const out = [];
  const a = process.argv.slice(3);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === `--${name}`) out.push(a[i + 1]);
    else if (a[i].startsWith(`--${name}=`)) out.push(a[i].slice(name.length + 3));
  }
  return all ? out.filter(Boolean) : out[0];
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const cmd = process.argv[2];
  if (cmd === "plan") {
    const dump = fs.readFileSync(0, "utf8");
    const domain = argv("domain");
    if (!domain) { console.error("--domain is required"); process.exit(2); }
    const result = plan(dump, { domain, aliases: argv("alias", true), ownFile: argv("own-file") ?? "" });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else if (cmd === "render") {
    const p = JSON.parse(fs.readFileSync(argv("plan"), "utf8"));
    const port = Number(argv("port"));
    if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error("bad --port"); process.exit(2); }
    process.stdout.write(render(p, {
      port,
      nginxVersion: argv("nginx-version") ?? "1.0.0",
      leOptions: argv("le-options") ?? null,
      generatedAt: argv("generated-at") ?? "",
      replaced: argv("replaced", true).length ? argv("replaced", true) : null,
    }));
  } else {
    console.error("usage: nginx-plan.mjs plan --domain D [--alias A]... --own-file F < nginx-T-output\n" +
                  "       nginx-plan.mjs render --plan FILE --port N --nginx-version X [--le-options PATH]");
    process.exit(2);
  }
}
