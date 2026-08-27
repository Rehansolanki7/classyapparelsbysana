import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { POST as legacyAdminLogin } from "../app/api/admin/auth/password/route";
import { POST as verifyAdminPin } from "../app/api/admin/auth/verify-pin/route";

function sameOriginRequest(url: string, body: object) {
  return new Request(url, {
    method: "POST",
    headers: { origin: "https://classyapparelsbysana.com", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("the retired access-key-only route cannot issue an administrator session", async () => {
  const response = await legacyAdminLogin(sameOriginRequest("https://classyapparelsbysana.com/api/admin/auth/password", { accessKey: "any-value" }));
  assert.equal(response.status, 410);
  assert.equal(response.headers.has("set-cookie"), false);
});

test("a PIN without a valid access key cannot issue an administrator session", async () => {
  const response = await verifyAdminPin(sameOriginRequest("https://classyapparelsbysana.com/api/admin/auth/verify-pin", { code: "123456" }));
  assert.equal(response.status, 401);
  assert.equal(response.headers.has("set-cookie"), false);
});

test("the PIN request route cannot set an administrator session", async () => {
  const root = new URL("../", import.meta.url);
  const route = await readFile(new URL("app/api/admin/auth/request-pin/route.ts", root), "utf8");
  assert.doesNotMatch(route, /sessionCookie|signSession/);
});
