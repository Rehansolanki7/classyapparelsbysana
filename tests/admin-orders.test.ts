import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin fulfilment view includes paid-order delivery details and keeps payment review separate", async () => {
  const [page, dashboard] = await Promise.all([
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/admin-dashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /orderItems/);
  assert.match(page, /inArray\(orderItems\.orderId/);
  assert.match(dashboard, /function isFulfillableOrder/);
  assert.match(dashboard, /Payment review/);
  assert.match(dashboard, /Copy delivery details/);
  assert.match(dashboard, /WhatsApp customer/);
  assert.match(dashboard, /Pack these items/);
  assert.match(dashboard, /Cancel & refund order/);
  assert.match(dashboard, /Mark shipped/);
  assert.match(dashboard, /This payment attempt cannot enter packing or shipping/);
});
