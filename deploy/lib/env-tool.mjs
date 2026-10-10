#!/usr/bin/env node
/**
 * The website's environment file: /etc/cloudpathway-web/env, read by systemd.
 *
 *   node env-tool.mjs check --env FILE
 *   node env-tool.mjs import-phonesystem --from /opt/phonesystem/app/server/.env --to FILE
 *
 * Values are written single-quoted, which systemd's EnvironmentFile takes
 * verbatim — no escapes, no expansion — so a MAIL_FROM with angle brackets and
 * spaces arrives in the app exactly as written. A value containing a single
 * quote or a newline is refused rather than mangled.
 */
import fs from "node:fs";

/**
 * systemd's EnvironmentFile reader, ported state for state from
 * parse_env_file_internal() (src/basic/env-file.c). This is what the service
 * actually receives, so it is what test-mail and `check` must use for
 * /etc/cloudpathway-web/env. Notably, unlike dotenv:
 *   - an unquoted value keeps `#` and everything after it (no inline comments);
 *   - after a closing quote, whitespace is skipped and any further text is
 *     APPENDED: 'a'  # note  ->  a# note
 *   - single quotes are verbatim; double quotes honour \" \\ \` \$ and line
 *     continuations; outside quotes a backslash escapes the next character.
 * Later assignments win.
 */
export function parseSystemdEnv(text) {
  const out = new Map();
  const isWs = (c) => c === " " || c === "\t" || c === "\r";
  let state = "PRE_KEY";
  let key = "";
  let value = "";
  let trailingWs = 0; // whitespace appended in VALUE that may turn out to be trailing
  const finish = () => {
    if (key) out.set(key, trailingWs ? value.slice(0, value.length - trailingWs) : value);
    key = ""; value = ""; trailingWs = 0;
  };
  for (let i = 0; i <= text.length; i++) {
    const c = i < text.length ? text[i] : "\n";
    switch (state) {
      case "PRE_KEY":
        if (c === "#" || c === ";") state = "COMMENT";
        else if (!isWs(c) && c !== "\n") { state = "KEY"; key = c; }
        break;
      case "KEY":
        if (c === "\n") { state = "PRE_KEY"; key = ""; }
        else if (c === "=") { state = "PRE_VALUE"; key = key.trim(); }
        else key += c;
        break;
      case "PRE_VALUE":
        if (c === "\n") { finish(); state = "PRE_KEY"; }
        else if (c === "'") state = "SQ";
        else if (c === '"') state = "DQ";
        else if (c === "\\") state = "VALUE_ESCAPE";
        else if (!isWs(c)) { state = "VALUE"; value += c; trailingWs = 0; }
        break;
      case "VALUE":
        if (c === "\n") { finish(); state = "PRE_KEY"; }
        else if (c === "\\") { state = "VALUE_ESCAPE"; trailingWs = 0; }
        else { value += c; trailingWs = isWs(c) ? trailingWs + 1 : 0; }
        break;
      case "VALUE_ESCAPE":
        state = "VALUE";
        if (c !== "\n") { value += c; trailingWs = 0; }
        break;
      case "SQ":
        if (c === "'") state = "PRE_VALUE";
        else value += c;
        break;
      case "DQ":
        if (c === '"') state = "PRE_VALUE";
        else if (c === "\\") state = "DQ_ESCAPE";
        else value += c;
        break;
      case "DQ_ESCAPE":
        state = "DQ";
        if ('"\\`$'.includes(c)) value += c;
        else if (c !== "\n") value += "\\" + c;
        break;
      case "COMMENT":
        if (c === "\\") state = "COMMENT_ESCAPE";
        else if (c === "\n") state = "PRE_KEY";
        break;
      case "COMMENT_ESCAPE":
        state = "COMMENT";
        break;
    }
  }
  if (state === "VALUE" || state === "PRE_VALUE") finish();
  return out;
}

export function parseSystemdEnvFile(path) {
  return parseSystemdEnv(fs.readFileSync(path, "utf8"));
}

/**
 * dotenv reader — for PhoneSystem's server/.env ONLY, which is read by dotenv,
 * not systemd. Never use it for the website's EnvironmentFile.
 */
export function parseEnv(text) {
  const out = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith("'")) v = v.slice(1, v.indexOf("'", 1) === -1 ? undefined : v.indexOf("'", 1));
    else if (v.startsWith('"')) {
      const end = v.lastIndexOf('"');
      v = v.slice(1, end > 0 ? end : undefined).replace(/\\(["\\$`])/g, "$1");
    } else {
      // Unquoted: an inline comment starts at whitespace + '#'.
      v = v.replace(/\s+#.*$/, "").trim();
    }
    out.set(m[1], v);
  }
  return out;
}

export function parseEnvFile(path) {
  return parseEnv(fs.readFileSync(path, "utf8"));
}

function quote(value) {
  if (/['\n\r]/.test(value)) throw new Error(`refusing a value containing a quote or newline: ${value.slice(0, 20)}…`);
  return `'${value}'`;
}

/** Set keys in an env file, keeping every other line (and comment) as it was. */
export function setKeys(path, updates) {
  const lines = fs.existsSync(path) ? fs.readFileSync(path, "utf8").split("\n") : [];
  const pending = new Map(Object.entries(updates));
  const out = lines.map((line) => {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (m && pending.has(m[1])) {
      const v = pending.get(m[1]);
      pending.delete(m[1]);
      return `${m[1]}=${quote(v)}`;
    }
    return line;
  });
  for (const [k, v] of pending) out.push(`${k}=${quote(v)}`);
  const text = out.join("\n").replace(/\n*$/, "\n");
  const tmp = `${path}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text, { mode: 0o600 });
  fs.renameSync(tmp, path);
}

const mask = (k) => (k ? `${k.slice(0, 4)}…${k.slice(-4)} (${k.length} chars)` : "(empty)");
const addressOf = (from) => (/<([^>]+)>/.exec(from)?.[1] ?? from).trim();
const sendable = (addr) => {
  const domain = addr.includes("@") ? addr.split("@").pop() : "";
  return domain.includes(".") && !domain.endsWith(".localhost") && !/example\.(com|org|net)$/.test(domain);
};

export function check(env, raw = null) {
  const notes = [];
  const say = (level, msg) => notes.push({ level, msg });
  // Where what the operator wrote (as dotenv would read it) is not what systemd
  // will hand the service, say so — that difference is invisible otherwise.
  if (raw) {
    const intended = parseEnv(raw);
    for (const [k, v] of env) {
      if (intended.has(k) && intended.get(k) !== v) {
        say("WARN", `${k}: systemd will deliver ${JSON.stringify(v)} — put comments on their own line, and nothing after a closing quote`);
      }
    }
  }
  const key = env.get("TELNYX_API_KEY") ?? "";
  const from = env.get("MAIL_FROM") ?? "";
  const portal = env.get("PORTAL_URL") ?? "";
  const to = env.get("NOTIFY_TO") || env.get("RESELLER_APPLICATION_TO") || "";
  const toName = env.get("NOTIFY_TO") ? "NOTIFY_TO" : "RESELLER_APPLICATION_TO";

  if (!key) say("WARN", "TELNYX_API_KEY is empty — signups and applications are stored but not emailed.");
  else say("OK", `TELNYX_API_KEY set: ${mask(key)}`);

  if (!from) say("WARN", "MAIL_FROM is empty — Telnyx sends only as a verified domain, so mail cannot go out.");
  else if (!sendable(addressOf(from))) say("WARN", `MAIL_FROM "${from}" is not on a real sendable domain.`);
  else say("OK", `MAIL_FROM ${from} (its domain must be verified under Email -> Domains in Telnyx)`);

  if (!portal) say("WARN", "PORTAL_URL is empty — the application email will not carry an Import button.");
  else if (!/^https:\/\/[^/\s]+/.test(portal)) say("WARN", `PORTAL_URL "${portal}" should be the portal's https:// address.`);
  else say("OK", `PORTAL_URL ${portal}`);

  if (to && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) say("WARN", `${toName} "${to}" is not an email address.`);
  else say("OK", `Every email the site sends goes to ${to || "12shimmel@gmail.com (default)"}`);
  return notes;
}

/**
 * Fill blanks in the website's env from PhoneSystem's server/.env: the Telnyx
 * key, the sending address, and the portal's public URL as PORTAL_URL. Never
 * overwrites a value that is already set — run it twice and nothing changes.
 */
export function importPhonesystem(fromPath, toPath) {
  const ps = parseEnvFile(fromPath);            // PhoneSystem's .env: dotenv
  const ours = fs.existsSync(toPath) ? parseSystemdEnvFile(toPath) : new Map(); // ours: systemd
  const updates = {};
  const report = [];
  const offer = (key, value, label) => {
    if (!value) { report.push(`skip  ${key}: PhoneSystem has no ${label}`); return; }
    if (ours.get(key)) { report.push(`keep  ${key}: already set here, left alone`); return; }
    updates[key] = value;
    report.push(`set   ${key}: ${key === "TELNYX_API_KEY" ? mask(value) : value}`);
  };
  offer("TELNYX_API_KEY", ps.get("TELNYX_API_KEY"), "TELNYX_API_KEY");
  const psFrom = ps.get("MAIL_FROM") ?? "";
  const addr = addressOf(psFrom);
  // Same verified sending domain, the website's own display name.
  offer("MAIL_FROM", addr && sendable(addr) ? `Cloudpathway <${addr}>` : "", "usable MAIL_FROM");
  offer("PORTAL_URL", (ps.get("PUBLIC_BASE_URL") ?? "").replace(/\/+$/, ""), "PUBLIC_BASE_URL");
  if (Object.keys(updates).length) setKeys(toPath, updates);
  const driver = (ps.get("MAIL_DRIVER") ?? "").toLowerCase();
  if (driver !== "telnyx") {
    report.push(
      `note  PhoneSystem's MAIL_DRIVER is "${driver || "(unset)"}", not telnyx — its sending domain may not be ` +
        "verified in Telnyx Email yet. PhoneSystem's scripts/telnyx-email.mjs --domain <domain> checks that.",
    );
  }
  return report;
}

/* CLI */
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const args = process.argv.slice(3);
  const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
  const cmd = process.argv[2];
  try {
    if (cmd === "check") {
      const raw = fs.readFileSync(opt("env"), "utf8");
      for (const { level, msg } of check(parseSystemdEnv(raw), raw)) console.log(`  ${level.padEnd(4)} ${msg}`);
    } else if (cmd === "export") {
      // The service's environment exactly as systemd will build it, as JSON —
      // piped to test-mail so the secret never appears on a command line.
      process.stdout.write(JSON.stringify(Object.fromEntries(parseSystemdEnvFile(opt("env")))));
    } else if (cmd === "import-phonesystem") {
      for (const line of importPhonesystem(opt("from"), opt("to"))) console.log(`  ${line}`);
    } else {
      console.error("usage: env-tool.mjs check --env FILE | export --env FILE | import-phonesystem --from PS_ENV --to FILE");
      process.exit(2);
    }
  } catch (err) {
    console.error(`env-tool: ${err.message}`);
    process.exit(1);
  }
}
