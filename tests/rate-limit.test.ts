import assert from "node:assert/strict";
import test from "node:test";
import { checkRateLimit, clientAddress } from "../lib/rate-limit";

test("rate limiting blocks requests after the configured attempt count", () => {
  global.classyApparelsRateLimits?.clear();
  assert.equal(checkRateLimit("test-key", 2, 60_000).allowed, true);
  assert.equal(checkRateLimit("test-key", 2, 60_000).allowed, true);
  const blocked = checkRateLimit("test-key", 2, 60_000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
});

test("the first forwarded address is used", () => {
  const request = new Request("https://example.com", { headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.5" } });
  assert.equal(clientAddress(request), "203.0.113.10");
});
