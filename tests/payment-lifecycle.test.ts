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

test("Razorpay receives an order number and item summary without exposing customer details", async () => {
  const [createOrder, checkout] = await Promise.all([
    readFile(new URL("../app/api/payments/create-order/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/checkout/checkout-client.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(createOrder, /const checkoutDescription = `Order \$\{orderNumber\}/);
  assert.match(createOrder, /order_number: orderNumber/);
  assert.match(createOrder, /items: itemSummary/);
  assert.match(checkout, /description: order\.description/);
  assert.doesNotMatch(createOrder, /notes: \{[^}]*customer/i);
});

test("unpaid checkouts are not customer orders and are scrubbed before short retention", async () => {
  const [account, orders, retention] = await Promise.all([
    readFile(new URL("../app/account/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/orders.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/retention.ts", import.meta.url), "utf8"),
  ]);
  assert.match(account, /eq\(orders\.paymentStatus, "captured"\)/);
  assert.match(account, /eq\(orders\.paymentStatus, "refunded"\)/);
  assert.match(orders, /class CancelledCheckoutConflict/);
  assert.match(orders, /cancelled-\$\{orderId\}@invalid\.local/);
  assert.match(orders, /tx\.delete\(orderItems\)/);
  assert.match(retention, /UNPAID_CHECKOUT_RETENTION_DAYS = 4/);
  assert.match(retention, /cancelPendingOrderAndRelease\(order\.id, false, true\)/);
});
