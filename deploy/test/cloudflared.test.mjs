/** Run: node deploy/test/cloudflared.test.mjs */
import assert from "node:assert/strict";
import { route } from "../lib/cloudflared.mjs";

let passed = 0;
const test = (n, f) => { f(); passed++; console.log(`  ok  ${n}`); };

// The operator's config, per PhoneSystem docs/cloudflare-tunnel.md §9b.
const DOC = `tunnel: 6ff42ae2-765d-4adf-8112-31c55c1551ef
credentials-file: /etc/cloudflared/6ff42ae2-765d-4adf-8112-31c55c1551ef.json

ingress:
  - hostname: portal.cloudpathway.org
    service: http://127.0.0.1:80
  - hostname: cloudpathway.org
    service: http://127.0.0.1:80
  - hostname: www.cloudpathway.org
    service: http://127.0.0.1:80
  # Still last, still required.
  - service: http_status:404
`;

test("the documented config routes cloudpathway.org to nginx on :80", () => {
  assert.deepEqual(route(DOC, "cloudpathway.org"), { found: true, service: "http://127.0.0.1:80", catchAll: false, toNginx: true });
});
test("hostnames are matched case-insensitively", () => {
  assert.equal(route(DOC, "CloudPathway.org").toNginx, true);
});
test("an unlisted hostname falls to the catch-all, which is not nginx", () => {
  const r = route(DOC, "other.example");
  assert.equal(r.catchAll, true); assert.equal(r.toNginx, false);
});
test("first match wins, top-down", () => {
  const cfg = `ingress:\n  - hostname: "*.cloudpathway.org"\n    service: http://127.0.0.1:4000\n  - hostname: portal.cloudpathway.org\n    service: http://127.0.0.1:80\n  - service: http_status:404\n`;
  assert.equal(route(cfg, "portal.cloudpathway.org").service, "http://127.0.0.1:4000");
  assert.equal(route(cfg, "cloudpathway.org").catchAll, true, "*.x does not match the apex");
});
test("the tunnel pointing the site straight at an app port is not nginx", () => {
  const cfg = DOC.replace("hostname: cloudpathway.org\n    service: http://127.0.0.1:80", "hostname: cloudpathway.org\n    service: http://127.0.0.1:3000");
  assert.equal(route(cfg, "cloudpathway.org").toNginx, false);
});
test("localhost, ::1 and an implicit :80 all count as local nginx; https does not", () => {
  for (const s of ["http://localhost", "http://localhost:80", "http://[::1]:80", "http://127.0.0.1"]) {
    assert.equal(route(`ingress:\n  - hostname: cloudpathway.org\n    service: ${s}\n  - service: http_status:404\n`, "cloudpathway.org").toNginx, true, s);
  }
  assert.equal(route(`ingress:\n  - hostname: cloudpathway.org\n    service: https://127.0.0.1:443\n`, "cloudpathway.org").toNginx, false);
});
test("originRequest and other keys inside a rule are tolerated", () => {
  const cfg = `ingress:\n  - hostname: cloudpathway.org\n    originRequest:\n      noTLSVerify: true\n    service: http://127.0.0.1:80\n  - service: http_status:404\n`;
  assert.equal(route(cfg, "cloudpathway.org").toNginx, true);
});
test("no ingress section (token-run tunnel): nothing found", () => {
  assert.deepEqual(route("tunnel: abc\n", "cloudpathway.org"), { found: false });
});
console.log(`\n${passed} cloudflared tests passed`);
