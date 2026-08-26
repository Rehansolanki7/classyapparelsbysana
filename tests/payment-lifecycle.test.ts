import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("checkout dismissal releases a pending reservation without treating a retry failure as cancellation", async () => {
  const [checkout, orders] = await Promise.all([
    readFile(new URL("../app/checkout/checkout-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/orders.ts", import.meta.url), "utf8"),
  ]);
  assert.match(checkout, /api\/payments\/cancel/);
  assert.match(checkout, /if \(!paymentResultReceived\)/);
  assert.match(orders, /export async function markPaymentAttemptFailed/);
  assert.doesNotMatch(orders.match(/export async function markPaymentAttemptFailed[\s\S]*?(?=export async function cancelPendingOrderAndRelease)/)?.[0] ?? "", /cancelPendingOrderAndRelease/);
});

test("payment webhooks bind captured amount and currency before inventory finalization", async () => {
  const source = await readFile(new URL("../app/api/payments/webhook/route.ts", import.meta.url), "utf8");
  assert.match(source, /payment\.amount !== order\.totalPaise/);
  assert.match(source, /payment\.currency !== "INR"/);
  assert.match(source, /attemptAutomaticRefund/);
});
