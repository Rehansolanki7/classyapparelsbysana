import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { constantTimeEqual, hmacSha256Hex, rejectCrossSite } from "../lib/security";

test("HMAC generation and constant-time comparison match known SHA-256 output", async () => {
  const signature = await hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog");
  assert.equal(signature, "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
  assert.equal(constantTimeEqual(signature, signature.toUpperCase()), true);
  assert.equal(constantTimeEqual(signature, `${signature}0`), false);
  assert.equal(constantTimeEqual("", "not-empty"), false);
});

test("cross-site writes are rejected while same-origin writes are allowed", () => {
  const sameOrigin = new Request("https://classyapparelsbysana.com/api/test", { headers: { origin: "https://classyapparelsbysana.com" } });
  const attacker = new Request("https://classyapparelsbysana.com/api/test", { headers: { origin: "https://attacker.example" } });
  assert.equal(rejectCrossSite(sameOrigin), null);
  assert.equal(rejectCrossSite(attacker)?.status, 403);
});

test("the customer storefront never exposes an admin navigation link", async () => {
  const root = new URL("../", import.meta.url);
  const storefront = await readFile(new URL("app/storefront.tsx", root), "utf8");
  assert.doesNotMatch(storefront, /href=["']\/admin(?:["'?]|\/)/);
});
