#!/usr/bin/env node
/**
 * Send one real message through Telnyx with the website's own mail code.
 *
 *   node deploy/test-mail.mjs --env /etc/cloudpathway-web/env [--to you@example.com] \
 *        [--app /opt/cloudpathway-web/current]
 *   … | node deploy/test-mail.mjs --env - [--to you@example.com]   # env as JSON on stdin
 *
 * Without --to it sends where the site sends everything: NOTIFY_TO (or the
 * older RESELLER_APPLICATION_TO), else 12shimmel@gmail.com — lib/notify.ts.
 *
 * `install.sh test-mail` uses the second form: root reads the env file and
 * pipes it in, and this runs as the service account — so neither the app's
 * code nor anything it imports runs as root, and the API key never appears
 * on a command line.
 *
 * It imports the deployed release's lib/mailer.ts (Node strips the types) and
 * calls the same sendMail() the reseller form calls, so a pass proves the
 * request the site will make — not a look-alike assembled here. Accepted is not
 * delivered: check the inbox, and Telnyx's Email log, afterwards.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import { parseSystemdEnvFile } from "./lib/env-tool.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const envFile = opt("env", "/etc/cloudpathway-web/env");
const app = path.resolve(opt("app", path.join(path.dirname(new URL(import.meta.url).pathname), "..")));

// Read exactly as systemd builds the service's environment from the same file.
const env = envFile === "-"
  ? Object.entries(JSON.parse(fs.readFileSync(0, "utf8")))
  : [...parseSystemdEnvFile(envFile)];
for (const [k, v] of env) process.env[k] = String(v);

const to = (opt("to") || process.env.NOTIFY_TO || process.env.RESELLER_APPLICATION_TO || "12shimmel@gmail.com").trim();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
  console.error("usage: test-mail.mjs [--to you@example.com] [--env FILE] [--app RELEASE_DIR]");
  process.exit(2);
}
console.log(`to: ${to}`);

const { sendMail, describeMail, mailConfigured } = await import(pathToFileURL(path.join(app, "lib/mailer.ts")).href);
console.log(`transport: ${describeMail()}`);
if (!mailConfigured()) {
  console.error(`not configured — fix ${envFile === "-" ? "the env file" : envFile} first`);
  process.exit(1);
}
try {
  const res = await sendMail({
    to,
    subject: "Cloudpathway website — test message",
    text:
      "This is a test from the Cloudpathway website's deploy tooling.\n\n" +
      "If it arrived, reseller applications will reach their inbox the same way.\n",
    html:
      "<p>This is a test from the Cloudpathway website's deploy tooling.</p>" +
      "<p>If it arrived, reseller applications will reach their inbox the same way.</p>",
  });
  console.log(`Telnyx: ${res.detail}. Accepted is not delivered — check ${to}.`);
} catch (err) {
  console.error(`failed: ${err.message}`);
  process.exit(1);
}
