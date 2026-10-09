#!/usr/bin/env node
/**
 * Send one real message through Telnyx with the website's own mail code.
 *
 *   sudo node deploy/test-mail.mjs --env /etc/cloudpathway-web/env --to you@example.com \
 *        [--app /opt/cloudpathway-web/current]
 *
 * It imports the deployed release's lib/mailer.ts (Node strips the types) and
 * calls the same sendMail() the reseller form calls, so a pass proves the
 * request the site will make — not a look-alike assembled here. Accepted is not
 * delivered: check the inbox, and Telnyx's Email log, afterwards.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnvFile } from "./lib/env-tool.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const envFile = opt("env", "/etc/cloudpathway-web/env");
const to = opt("to");
const app = path.resolve(opt("app", path.join(path.dirname(new URL(import.meta.url).pathname), "..")));

if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
  console.error("usage: test-mail.mjs --to you@example.com [--env FILE] [--app RELEASE_DIR]");
  process.exit(2);
}

for (const [k, v] of parseEnvFile(envFile)) process.env[k] = v;

const { sendMail, describeMail, mailConfigured } = await import(pathToFileURL(path.join(app, "lib/mailer.ts")).href);
console.log(`transport: ${describeMail()}`);
if (!mailConfigured()) {
  console.error(`not configured — fix ${envFile} first`);
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
