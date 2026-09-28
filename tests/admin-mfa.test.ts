import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { decodeJwt } from "jose";
import { POST as legacyAdminLogin } from "../app/api/admin/auth/password/route";
import { POST as verifyAdminPin } from "../app/api/admin/auth/verify-pin/route";
import { ADMIN_SESSION_MAX_AGE_SECONDS, sessionCookie, signSession, type AppUser } from "../lib/auth";

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

test("a verified administrator session lasts 24 hours", async () => {
  const originalAuthSecret = process.env.AUTH_SECRET;
  const originalAdminAccessKey = process.env.ADMIN_ACCESS_KEY;
  process.env.AUTH_SECRET = "test-auth-secret-that-is-at-least-32-characters";
  process.env.ADMIN_ACCESS_KEY = "test-admin-key-that-is-at-least-32-characters";

  try {
    const administrator: AppUser = {
      id: "admin-access-key",
      email: "owner@example.com",
      name: "",
      role: "owner",
      sessionVersion: 0,
      adminAuthenticated: true,
    };
    const token = await signSession(administrator);
    const payload = decodeJwt(token);
    const cookie = sessionCookie(token, true);

    assert.equal(ADMIN_SESSION_MAX_AGE_SECONDS, 24 * 60 * 60);
    assert.equal(payload.exp! - payload.iat!, ADMIN_SESSION_MAX_AGE_SECONDS);
    assert.equal(cookie.options.maxAge, ADMIN_SESSION_MAX_AGE_SECONDS);
  } finally {
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalAuthSecret;
    if (originalAdminAccessKey === undefined) delete process.env.ADMIN_ACCESS_KEY;
    else process.env.ADMIN_ACCESS_KEY = originalAdminAccessKey;
  }
});
