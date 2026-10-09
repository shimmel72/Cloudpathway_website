#!/usr/bin/env node
/**
 * Where does a Cloudflare tunnel send a hostname?
 *
 *   node cloudflared.mjs route --config /etc/cloudflared/config.yml --hostname cloudpathway.org
 *   -> {"found":true,"service":"http://127.0.0.1:80","toNginx":true}
 *
 * Reads only the `ingress:` list of a locally managed tunnel's config.yml —
 * `- hostname: …` / `service: …` pairs, matched top-down, first match wins,
 * exactly as cloudflared does. A tunnel run with --token keeps its routes in
 * the Cloudflare dashboard, so there is nothing to read; the installer asks
 * the operator instead of guessing.
 */
import fs from "node:fs";

const unquote = (v) => v.trim().replace(/^(['"])(.*)\1$/, "$2").trim();

export function ingress(text) {
  const rules = [];
  let inIngress = false;
  let indent = -1;
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "");
    if (!line.trim()) continue;
    const lead = line.length - line.trimStart().length;
    if (/^ingress\s*:/.test(line.trim()) && lead === 0) { inIngress = true; continue; }
    if (!inIngress) continue;
    if (lead === 0) break; // next top-level key
    const item = /^(\s*)-\s*(.*)$/.exec(line);
    if (item && (indent === -1 || item[1].length === indent)) {
      indent = item[1].length;
      cur = {};
      rules.push(cur);
      const kv = /^([A-Za-z]+)\s*:\s*(.*)$/.exec(item[2]);
      if (kv) cur[kv[1]] = unquote(kv[2]);
      continue;
    }
    const kv = /^\s*([A-Za-z]+)\s*:\s*(.*)$/.exec(line);
    if (kv && cur && lead > indent) cur[kv[1]] = unquote(kv[2]);
  }
  return rules;
}

function hostMatches(pattern, host) {
  if (!pattern) return true; // a rule without hostname matches everything (the catch-all)
  pattern = pattern.toLowerCase();
  if (pattern.startsWith("*.")) return host.endsWith(pattern.slice(1)) && host !== pattern.slice(2);
  return pattern === host;
}

/** nginx on this machine's port 80, however the URL spells it. */
export function isLocalNginx(service) {
  try {
    const u = new URL(service);
    const local = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(u.hostname);
    return u.protocol === "http:" && local && (u.port === "" || u.port === "80");
  } catch {
    return false;
  }
}

export function route(text, hostname) {
  const host = hostname.toLowerCase();
  const rule = ingress(text).find((r) => hostMatches(r.hostname, host));
  if (!rule || !rule.service) return { found: false };
  return { found: true, service: rule.service, catchAll: !rule.hostname, toNginx: isLocalNginx(rule.service) };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const a = process.argv.slice(2);
  const opt = (n) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : undefined; };
  if (a[0] !== "route" || !opt("config") || !opt("hostname")) {
    console.error("usage: cloudflared.mjs route --config FILE --hostname NAME");
    process.exit(2);
  }
  try {
    process.stdout.write(JSON.stringify(route(fs.readFileSync(opt("config"), "utf8"), opt("hostname"))) + "\n");
  } catch (err) {
    console.error(`cloudflared: ${err.message}`);
    process.exit(1);
  }
}
