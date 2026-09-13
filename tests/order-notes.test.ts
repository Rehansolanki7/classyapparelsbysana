import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("checkout notes are optional, persisted for admins, and scrubbed from abandoned checkouts", async () => {
  const [schema, migration, createOrder, checkout, admin, orders, notifications] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle-hostinger/0012_order_customer_note.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/payments/create-order/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/checkout/checkout-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/admin-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/orders.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/order-notifications.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /customerNote: varchar\("customer_note", \{ length: 1000 \}\)/);
  assert.match(migration, /ADD COLUMN customer_note varchar\(1000\) NOT NULL DEFAULT ''/);
  assert.match(createOrder, /customerNote: clean\(customer\.customerNote, 1000\)/);
  assert.match(createOrder, /customerNote: validated\.customer\.customerNote/);
  assert.match(checkout, /Note for Sana/);
  assert.match(checkout, /maxLength=\{1000\}/);
  assert.match(admin, /order\.customerNote/);
  assert.match(orders, /customerNote: redactCustomerData \? ""/);
  assert.match(notifications, /Note for Sana/);
});
