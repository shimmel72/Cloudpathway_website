/** Run: node deploy/test/env-tool.test.mjs */
import assert from "node:assert/strict";
import { parseSystemdEnv, check } from "../lib/env-tool.mjs";

let passed = 0;
const test = (n, f) => { f(); passed++; console.log(`  ok  ${n}`); };
const one = (line) => parseSystemdEnv(line + "\n").get(line.split("=")[0].trim());

// Expected values are what systemd itself produced for these lines in the review (#19).
test("single-quoted value with angle brackets and spaces arrives intact", () =>
  assert.equal(one("MAIL_FROM='Cloudpathway <no-reply@cloudpathway.org>'"), "Cloudpathway <no-reply@cloudpathway.org>"));
test("text after a closing quote is appended (whitespace skipped)", () =>
  assert.equal(one("MAIL_FROM='Cloudpathway <no-reply@cloudpathway.org>'  # verified in Telnyx"), "Cloudpathway <no-reply@cloudpathway.org># verified in Telnyx"));
test("an unquoted value keeps an inline comment, interior spaces kept, trailing trimmed", () =>
  assert.equal(one("TELNYX_API_KEY=KEY0123456789  # same as portal   "), "KEY0123456789  # same as portal"));
test("quote concatenation", () => assert.equal(one("TRAIL='abc'def"), "abcdef"));
test("double quotes honour escapes", () => assert.equal(one('X="a \\"b\\" \\$c \\\\d \\q"'), 'a "b" $c \\d \\q'));
test("comment lines and blank lines are ignored; later assignments win", () => {
  const m = parseSystemdEnv("# c\n; c\n\nA=1\nA=2\n");
  assert.equal(m.get("A"), "2"); assert.equal(m.size, 1);
});
test("empty values", () => { assert.equal(one("A="), ""); assert.equal(one("B=''"), ""); });
test("check() flags a line whose systemd value differs from what was meant", () => {
  const raw = "MAIL_FROM='Cloudpathway <no-reply@cloudpathway.org>'  # verified\n";
  const notes = check(parseSystemdEnv(raw), raw);
  assert.ok(notes.some((n) => n.level === "WARN" && /systemd will deliver/.test(n.msg)));
});
test("check() is quiet about lines systemd reads as written", () => {
  const raw = "TELNYX_API_KEY='KEYabcdef0123456789'\nMAIL_FROM='Cloudpathway <no-reply@cloudpathway.org>'\nPORTAL_URL='https://portal.cloudpathway.org'\n";
  assert.ok(!check(parseSystemdEnv(raw), raw).some((n) => /systemd will deliver/.test(n.msg)));
});
test("every email goes to one address: NOTIFY_TO, else the older RESELLER_APPLICATION_TO, else the owner", () => {
  const said = (raw) => check(parseSystemdEnv(raw), raw).map((n) => n.msg).find((m) => /Every email the site sends/.test(m));
  assert.match(said(""), /goes to 12shimmel@gmail\.com \(default\)/);
  assert.match(said("RESELLER_APPLICATION_TO='old@example.com'\n"), /goes to old@example\.com/);
  assert.match(said("NOTIFY_TO='new@example.com'\nRESELLER_APPLICATION_TO='old@example.com'\n"), /goes to new@example\.com/);
  const bad = check(parseSystemdEnv("NOTIFY_TO='nope'\n"), "NOTIFY_TO='nope'\n").map((n) => n.msg);
  assert.ok(bad.some((m) => /NOTIFY_TO "nope" is not an email address/.test(m)));
});

console.log(`\n${passed} env-tool tests passed`);
