#!/usr/bin/env node
/**
 * Reads `nginx -T` and decides how to hand a domain to the Cloudpathway site.
 *
 *   nginx -T 2>/dev/null | node nginx-plan.mjs plan --domain D [--alias A]... --own-file F
 *   node nginx-plan.mjs render --plan plan.json --port P --nginx-version 1.26.3 --mode tunnel|http|tls
 *
 * The configuration is read the way nginx reads it: from the main file, with
 * every `include` spliced in where it appears (files of one glob in sorted
 * order). That gives nginx's real processing order — which decides the default
 * server for each socket — and lets a certificate set in an included snippet,
 * or inherited from http{}, be seen.
 *
 * The plan is deliberately conservative. A file is only disabled when every
 * server block in it belongs to the domain (or its www. twin) and it holds no
 * http-level settings others might rely on. Anything else is a conflict and
 * nothing is changed. Taking over a website must never be able to take down —
 * or quietly re-route — the phone system next to it.
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
    while (j < n && !/[\s;{}]/.test(text[j])) { v += text[j]; j++; }
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

function globToRegex(glob) {
  return new RegExp(
    "^" + glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]") + "$",
  );
}

/**
 * The configuration as nginx processes it. Includes are spliced in at the
 * point they appear, files of one glob in sorted order, and every directive
 * remembers the file it came from. With `placeholder`, the managed file's
 * future position in its glob is marked by an `__own__` node, so the effect of
 * adding it can be judged before it exists.
 */
export function expand(files, { ownFile = "", placeholder = false } = {}) {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const trees = new Map();
  const treeOf = (p) => {
    if (!trees.has(p)) trees.set(p, parse(tokenize(byPath.get(p).text)));
    return trees.get(p);
  };
  function walk(nodes, file, depth) {
    const out = [];
    for (const d of nodes) {
      if (d.name === "include" && d.args[0] && depth < 16) {
        const re = globToRegex(d.args[0]);
        const matches = files.map((f) => f.path).filter((p) => re.test(p));
        if (placeholder && ownFile && re.test(ownFile) && !matches.includes(ownFile)) matches.push(ownFile);
        matches.sort();
        for (const p of matches) {
          if (!byPath.has(p)) { out.push({ name: "__own__", args: [], line: 0, file: p }); continue; }
          out.push(...walk(treeOf(p), p, depth + 1));
        }
        continue;
      }
      const copy = { ...d, file };
      if (d.block) copy.block = walk(d.block, file, depth);
      out.push(copy);
    }
    return out;
  }
  return files[0] ? walk(treeOf(files[0].path), files[0].path, 0) : [];
}

function parseListen(args) {
  const [addr = "80", ...flags] = args;
  if (addr.startsWith("unix:")) return { unix: true, port: 0, host: addr, flags };
  let host = "";
  let port = addr;
  const v6 = /^\[([^\]]*)\](?::(\d+))?$/.exec(addr);
  if (v6) { host = `[${v6[1]}]`; port = v6[2] ?? "80"; }
  else if (addr.includes(":")) { const i = addr.lastIndexOf(":"); host = addr.slice(0, i); port = addr.slice(i + 1); }
  else if (!/^\d+$/.test(addr)) { host = addr; port = "80"; }
  if (host === "*" || host === "0.0.0.0") host = "";
  if (host === "[::]") host = "[::]";
  return {
    host,
    port: Number(port),
    ssl: flags.includes("ssl"),
    quic: flags.includes("quic"),
    defaultServer: flags.includes("default_server") || flags.includes("default"),
    ipv6: host.startsWith("["),
  };
}

function describe(server, inherited) {
  const names = [];
  const listens = [];
  const certs = [];
  const keys = [];
  let acmeRoot = null;
  let includesLeOptions = false;
  let sslOn = false;
  for (const d of server.block) {
    if (d.file && /options-ssl-nginx\.conf$/.test(d.file)) includesLeOptions = true;
    // Plain names are case-insensitive; a regex (~…) is left exactly as written,
    // since lowercasing one changes what it means (\D becomes \d).
    if (d.name === "server_name") names.push(...d.args.map((s) => (s.startsWith("~") ? s : s.toLowerCase().replace(/\.$/, ""))));
    if (d.name === "listen") listens.push(parseListen(d.args));
    if (d.name === "ssl_certificate" && d.args[0]) certs.push(d.args[0]);
    if (d.name === "ssl_certificate_key" && d.args[0]) keys.push(d.args[0]);
    if (d.name === "ssl" && d.args[0] === "on") sslOn = true;
    if (d.name === "location" && d.block && d.args.some((a) => a.includes("/.well-known/acme-challenge"))) {
      const root = d.block.find((x) => x.name === "root");
      if (root) acmeRoot = root.args[0];
    }
  }
  if (sslOn) for (const l of listens) l.ssl = true;
  const servesHttps = listens.some((l) => l.ssl && !l.quic);
  let pairs = certs.map((c, i) => ({ cert: c, key: keys[i] ?? null })).filter((p) => p.key);
  let certFrom = pairs.length ? "server" : null;
  if (!pairs.length && servesHttps && inherited.cert && inherited.key) {
    pairs = [{ cert: inherited.cert, key: inherited.key }];
    certFrom = "http";
  }
  return {
    file: server.file, line: server.line, names, listens, certs: pairs, certFrom,
    acmeRoot, includesLeOptions, servesHttps,
  };
}

/** Every http server block, in the order nginx processes them. */
export function servers(tree) {
  const out = [];
  function walk(nodes, chain, inherited) {
    const here = { ...inherited };
    if (chain.at(-1) === "http") {
      for (const d of nodes) {
        if (d.block) continue;
        if (d.name === "ssl_certificate") here.cert = d.args[0];
        if (d.name === "ssl_certificate_key") here.key = d.args[0];
      }
    }
    for (const d of nodes) {
      if (d.name === "__own__" && chain.includes("http")) { out.push({ own: true, placeholder: true, file: d.file, line: 0, names: [], listens: [] }); continue; }
      if (!d.block) continue;
      if (d.name === "server" && chain.includes("http")) { out.push(describe(d, here)); continue; }
      if (["stream", "mail", "upstream", "location", "if", "map", "types", "geo"].includes(d.name)) continue;
      walk(d.block, [...chain, d.name], here);
    }
  }
  walk(tree, [], { cert: null, key: null });
  return out;
}

/* ------------------------------------------------------------------------ */
/* Planning                                                                 */
/* ------------------------------------------------------------------------ */

function pcreToJs(src) {
  let flags = "";
  let s = src;
  const inline = /^\(\?([imsx]+)\)/.exec(s);
  if (inline) { flags = inline[1].replace(/x/g, ""); s = s.slice(inline[0].length); }
  s = s.replace(/\(\?P</g, "(?<");
  return new RegExp(s, flags);
}

/** How a server_name entry relates to the domain. */
function nameRelation(name, domain) {
  if (name === domain) return "exact";
  if (name === `www.${domain}`) return "www";
  if (name === "_" || name === "" || name === '""') return "placeholder";
  if (name.startsWith(".") && (domain === name.slice(1) || domain.endsWith(name))) return "suffix-covers";
  if (name.startsWith("*.") && domain.endsWith(name.slice(1)) && domain !== name.slice(2)) return "suffix-covers";
  if (name.startsWith("~")) {
    try { return pcreToJs(name.slice(1)).test(domain) ? "regex-covers" : "other"; } catch { return "regex-unknown"; }
  }
  return "other";
}

const HTTP_LEVEL_OK = new Set(["server"]);

export function plan(dump, { domain, aliases = [], ownFile }) {
  domain = domain.toLowerCase();
  aliases = aliases.map((a) => a.toLowerCase()).filter((a) => a && a !== domain);
  const files = splitFiles(dump);
  const fileByPath = new Map(files.map((f) => [f.path, f]));

  const tree = expand(files, { ownFile });
  const hasHttp = tree.some((d) => d.name === "http");
  // A dump without a main http{} (a fragment) is read file by file, as http.
  const all = hasHttp
    ? servers(tree)
    : files.flatMap((f) => servers([{ name: "http", args: [], line: 0, file: f.path, block: parse(tokenize(f.text)).map((d) => withFile(d, f.path)) }]));

  const conflicts = [];
  const warnings = [];
  const targets = [];
  const wanted = new Set([domain, ...aliases]);
  const autoAliases = new Set();

  for (const s of all) {
    if (s.own || s.file === ownFile) continue;
    const rel = s.names.map((n) => ({ n, r: nameRelation(n, domain) }));
    const touches = rel.some(({ n, r }) => r === "exact" || r === "www" || wanted.has(n));
    const covers = rel.find(({ r }) => r === "suffix-covers" || r === "regex-covers" || r === "regex-unknown");
    if (covers && !touches) {
      conflicts.push({
        file: s.file, line: s.line,
        reason: covers.r === "regex-unknown"
          ? `server_name ${covers.n} is a regular expression this installer cannot evaluate, so it may also match ${domain}; narrow it or confirm it does not`
          : `server_name ${covers.n} also matches ${domain}; it cannot be split automatically`,
      });
      continue;
    }
    if (!touches) continue;
    for (const { n, r } of rel) if (r === "www") autoAliases.add(n);
    const stray = rel.filter(({ n, r }) => !(r === "exact" || r === "www" || r === "placeholder" || wanted.has(n)));
    if (stray.length) {
      conflicts.push({
        file: s.file, line: s.line,
        reason: `the server block for ${domain} also answers for ${stray.map((x) => x.n).join(", ")}`,
      });
      continue;
    }
    targets.push(s);
  }

  // A file can only be switched off whole: every block in it must be ours, and
  // it must hold nothing at http level that another site could rely on.
  const toDisable = [];
  for (const path of [...new Set(targets.map((t) => t.file))]) {
    const inFile = all.filter((s) => s.file === path);
    const names = new Set([domain, ...aliases, ...autoAliases]);
    const strangers = inFile.filter((s) => !s.names.some((n) => names.has(n) || ["exact", "www"].includes(nameRelation(n, domain))));
    if (strangers.length) {
      conflicts.push({
        file: path, line: strangers[0].line,
        reason: `this file also holds a server block for ${strangers[0].names.join(" ") || "(no server_name)"}; move the ${domain} blocks into a file of their own first`,
      });
      continue;
    }
    let kind = null;
    if (/^\/etc\/nginx\/conf\.d\/[^/]+\.conf$/.test(path)) kind = "confd";
    else if (/^\/etc\/nginx\/sites-enabled\/[^/]+$/.test(path)) kind = "sites-enabled";
    if (!kind) {
      conflicts.push({
        file: path, line: inFile[0]?.line ?? 0,
        reason: `the server block for ${domain} lives in ${path}, which this installer will not edit; move it into /etc/nginx/conf.d/ first`,
      });
      continue;
    }
    const topLevel = fileByPath.has(path) ? parse(tokenize(fileByPath.get(path).text)).map((d) => d.name).filter((n) => !HTTP_LEVEL_OK.has(n)) : [];
    if (topLevel.length) {
      conflicts.push({
        file: path, line: 1,
        reason: `this file also sets ${[...new Set(topLevel)].join(", ")} at http level, which other sites may rely on; move those into their own file first`,
      });
      continue;
    }
    toDisable.push({ path, kind });
  }

  // Re-run: the old site is already disabled and the truth about certificate,
  // aliases and listen shape is in the file this installer wrote last time.
  const ownBlocks = all.filter((s) => s.file === ownFile && !s.own &&
    s.names.some((n) => n === domain || wanted.has(n) || nameRelation(n, domain) === "www"));
  for (const s of ownBlocks) for (const n of s.names) if (n !== domain && n !== "_") autoAliases.add(n);
  const blocks = targets.length ? targets : ownBlocks;

  for (const s of targets) {
    if (s.servesHttps && !s.certs.length) {
      conflicts.push({
        file: s.file, line: s.line,
        reason: `the current ${domain} block serves HTTPS but its certificate could not be found (not in the block, an included snippet, or http{}); add ssl_certificate to the block, then re-run`,
      });
    }
    for (const l of s.listens) {
      if (l.unix || l.quic || (l.port !== 80 && l.port !== 443)) {
        warnings.push(`${s.file}:${s.line} also listens on ${l.unix ? l.host : `${l.host || "*"}:${l.port}${l.quic ? " (quic)" : ""}`}; the new site will not`);
      }
    }
  }

  const apexBlock = blocks.find((s) => s.certs.length && s.names.includes(domain)) ?? blocks.find((s) => s.certs.length);
  const allAliases = [...new Set([...aliases, ...autoAliases])].sort();
  const aliasBlock = blocks.find((s) => s.certs.length && s !== apexBlock && allAliases.some((a) => s.names.includes(a)));
  const oldListens = blocks.flatMap((s) => s.listens).filter((l) => !l.unix && !l.quic);
  const hosts = (port) => {
    const hs = [...new Set(oldListens.filter((l) => l.port === port && !l.ipv6).map((l) => l.host))];
    return hs.length ? hs : [""];
  };
  // IPv6 only where something already listens on [::]:port — opening a new v6
  // socket changes what every other name resolving to this host gets over v6.
  const v6Listeners = (port) => all.some((s) => !s.own && s.listens.some((l) => l.ipv6 && l.port === port));
  const ipv6 = blocks.length
    ? { 80: oldListens.some((l) => l.ipv6 && l.port === 80), 443: oldListens.some((l) => l.ipv6 && l.port === 443) }
    : { 80: v6Listeners(80), 443: v6Listeners(443) };

  const defaultServer = {
    80: oldListens.some((l) => l.port === 80 && l.defaultServer),
    443: oldListens.some((l) => l.port === 443 && l.defaultServer),
  };

  return {
    domain,
    aliases: allAliases,
    ownFile,
    conflicts,
    warnings,
    toDisable,
    oldServerNames: [...new Set(targets.flatMap((t) => t.names))].sort(),
    source: targets.length ? "existing-site" : ownBlocks.length ? "previous-install" : "none",
    oldServedHttps: blocks.some((s) => s.servesHttps),
    tls: apexBlock ? { certs: apexBlock.certs, includesLeOptions: apexBlock.includesLeOptions, from: apexBlock.certFrom } : null,
    aliasTls: aliasBlock ? { certs: aliasBlock.certs } : null,
    acmeRoot: blocks.map((s) => s.acmeRoot).find(Boolean) ?? null,
    defaultServer,
    listenHosts: { 80: hosts(80), 443: hosts(443) },
    ipv6,
    defaultImpact: defaultImpact(files, { ownFile, toDisable, defaultServer }),
  };
}

function withFile(d, file) {
  const copy = { ...d, file };
  if (d.block) copy.block = d.block.map((x) => withFile(x, file));
  return copy;
}

/**
 * Would adding the managed file make it nginx's default server for a socket
 * that some OTHER site answers by default today?
 *
 * For each port and family: without an explicit default_server, nginx's
 * default is the first server listening there, in processing order. The
 * managed file is inserted at its sorted position in its include glob. If it
 * would become first, and today's default is neither the old site nor this
 * site, requests by IP, without SNI, or for unlisted names would move to the
 * website — away from the portal, typically. Returned per port so the
 * installer can check exactly the sockets it renders.
 */
function defaultImpact(files, { ownFile, toDisable, defaultServer }) {
  const disabled = new Set(toDisable.map((d) => d.path));
  const before = servers(expand(files, { ownFile }));
  const after = servers(expand(files, { ownFile, placeholder: true }))
    .filter((s) => !disabled.has(s.file))
    .map((s) => (s.file === ownFile ? { ...s, own: true } : s));
  const result = {};
  for (const port of [80, 443]) {
    for (const v6 of [false, true]) {
      const on = (s) => s.listens.some((l) => l.port === port && l.ipv6 === v6);
      const key = `${port}${v6 ? "v6" : ""}`;
      if (defaultServer[port]) { result[key] = null; continue; }
      const afterList = after.filter((s) => s.own || on(s));
      if (afterList.some((s) => !s.own && s.listens.some((l) => l.port === port && l.ipv6 === v6 && l.defaultServer))) { result[key] = null; continue; }
      if (!afterList.length || !afterList[0].own) { result[key] = null; continue; }
      const beforeList = before.filter(on);
      const today = beforeList.find((s) => s.listens.some((l) => l.port === port && l.ipv6 === v6 && l.defaultServer)) ?? beforeList[0];
      if (!today || disabled.has(today.file) || today.file === ownFile) { result[key] = null; continue; }
      result[key] = { file: today.file, line: today.line, names: today.names };
    }
  }
  return result;
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
 * mode:
 *   tls    — this server terminates TLS with the certificate in the plan:
 *            :80 redirects to https, :443 serves. HSTS is sent unless
 *            `hsts: false` — the installer turns it off for a certificate that
 *            cannot renew itself, since HSTS turns an expired certificate from
 *            a warning visitors can click through into a site they cannot reach.
 *   http   — plain HTTP on :80, no redirect, no HSTS (mirrors an HTTP-only site).
 *   tunnel — as http, for a Cloudflare tunnel: cloudflared connects from
 *            loopback and the visitor's address is taken from CF-Connecting-IP,
 *            trusted from loopback only and only inside this site's blocks.
 *            Never a redirect to https here: cloudflared always speaks http to
 *            the origin, so one would loop.
 *
 * `replaced` is what this site displaced, from the installer's saved state, so
 * a re-run (where the plan has nothing left to disable) renders identically.
 */
export function render(p, { port, nginxVersion, mode = "http", leOptions = null, generatedAt = "", replaced = null, hsts = true }) {
  if (!["tls", "http", "tunnel"].includes(mode)) throw new Error(`unknown mode ${mode}`);
  if (mode === "tls" && !p.tls?.certs?.length) throw new Error("tls mode needs a certificate in the plan");
  // HTTP/2 only where it can be scoped to this site. Before nginx 1.25.1 the
  // only switch is a socket-wide listen flag, which would change every other
  // site on :443 (the portal) too.
  const http2Directive = versionAtLeast(nginxVersion, "1.25.1");
  const canonical = p.domain;
  const replacedFiles = [...new Set(replaced ?? p.toDisable.map((d) => d.path))];
  const L = [];
  const listen = (portNo, { ssl = false, def = false } = {}) => {
    const flags = [ssl ? "ssl" : "", def ? "default_server" : ""].filter(Boolean).join(" ");
    const out = (p.listenHosts[portNo] ?? [""]).map((h) => `    listen ${h ? `${h}:` : ""}${portNo}${flags ? " " + flags : ""};`);
    if (p.ipv6?.[portNo]) out.push(`    listen [::]:${portNo}${flags ? " " + flags : ""};`);
    return out;
  };
  const sslLines = (tls) => [
    ...(http2Directive ? ["    http2 on;"] : []),
    ...tls.certs.flatMap((c) => [`    ssl_certificate     ${c.cert};`, `    ssl_certificate_key ${c.key};`]),
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
  const realIp = () => (mode === "tunnel"
    ? [
        "    # cloudflared connects from this machine; the visitor's address arrives in",
        "    # CF-Connecting-IP. Trusted from loopback only, and only in this site's",
        "    # blocks — the portal's handling of addresses is not changed. Without it,",
        "    # every visitor shares one rate-limit bucket.",
        "    set_real_ip_from 127.0.0.1;",
        "    set_real_ip_from ::1;",
        "    real_ip_header   CF-Connecting-IP;",
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
  const site = (portNo, { ssl, hsts, proto, tls }) => [
    "server {",
    ...listen(portNo, { ssl, def: p.defaultServer[portNo] }),
    `    server_name ${canonical};`,
    ...(ssl ? sslLines(tls) : []),
    "",
    "    access_log /var/log/nginx/cloudpathway-web.access.log;",
    "    error_log  /var/log/nginx/cloudpathway-web.error.log;",
    "",
    ...realIp(),
    ...headers(hsts),
    ...proxyBlock(proto),
    ...acme(),
    ...appLocations(),
    "}",
    "",
  ];

  L.push(
    "# Cloudpathway website — managed by deploy/install.sh in the Cloudpathway_website repo.",
    "# Re-running the installer rewrites this file; edit the template, not this.",
    `# Mode: ${mode}${mode === "tunnel" ? " (behind a Cloudflare tunnel: plain http here, TLS at Cloudflare)" : ""}.`,
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

  if (mode === "tls") {
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
        ...sslLines(p.aliasTls ?? p.tls),
        "",
        `    return 301 https://${canonical}$request_uri;`,
        "}",
        "",
      );
    }
    L.push(...site(443, { ssl: true, hsts, proto: "$scheme", tls: p.tls }));
  } else {
    L.push(
      mode === "tunnel"
        ? "# What the visitor used at Cloudflare (https), not this hop (always http)."
        : "# What the visitor used, if a proxy in front says so; otherwise this hop.",
      "map $http_x_forwarded_proto $cloudpathway_forwarded_proto {",
      "    default $http_x_forwarded_proto;",
      '    ""      $scheme;',
      "}",
      "",
    );
    if (p.aliases.length) {
      L.push(
        `# ${p.aliases.join(", ")} -> ${canonical}`,
        "server {",
        ...listen(80),
        `    server_name ${p.aliases.join(" ")};`,
        mode === "tunnel"
          ? `    return 301 https://${canonical}$request_uri;`
          : `    return 301 $cloudpathway_forwarded_proto://${canonical}$request_uri;`,
        "}",
        "",
      );
    }
    L.push(...site(80, { ssl: false, hsts: false, proto: "$cloudpathway_forwarded_proto" }));
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
  try {
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
        mode: argv("mode") ?? "http",
        nginxVersion: argv("nginx-version") ?? "1.0.0",
        leOptions: argv("le-options") ?? null,
        generatedAt: argv("generated-at") ?? "",
        replaced: argv("replaced", true).length ? argv("replaced", true) : null,
        hsts: !process.argv.includes("--no-hsts"),
      }));
    } else {
      console.error("usage: nginx-plan.mjs plan --domain D [--alias A]... --own-file F < nginx-T-output\n" +
                    "       nginx-plan.mjs render --plan FILE --port N --nginx-version X --mode tls|http|tunnel [--le-options PATH] [--replaced F]... [--no-hsts]");
      process.exit(2);
    }
  } catch (err) {
    console.error(`nginx-plan: ${err.message}`);
    process.exit(1);
  }
}
