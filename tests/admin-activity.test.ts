import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin activity is a dedicated, searchable and filterable workspace", async () => {
  const [page, dashboard] = await Promise.all([
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/admin-dashboard.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /from\(systemEvents\)[\s\S]*limit\(200\)/);
  assert.match(dashboard, /type ActivityCategory/);
  assert.match(dashboard, /id: "activity", label: "Activity"/);
  assert.match(dashboard, /tab === "activity"/);
  assert.match(dashboard, /activityCategoryFilter/);
  assert.match(dashboard, /activitySeverityFilter/);
  assert.match(dashboard, /Search activity/);
  assert.match(dashboard, /activityLabel/);
  assert.doesNotMatch(dashboard, /<article className="admin-card admin-activity"/);
});

test("admin overview surfaces active products that need restocking", async () => {
  const dashboard = await readFile(new URL("../app/admin/admin-dashboard.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /LOW_STOCK_THRESHOLD = 5/);
  assert.match(dashboard, /lowStockProducts/);
  assert.match(dashboard, /admin-notification-panel/);
  assert.match(dashboard, /admin-notification-icon stock/);
  assert.match(dashboard, /openProduct\(product\.id\)/);
  assert.match(dashboard, /Out of stock/);
});

test("admin overview alerts on captured paid orders waiting for fulfilment", async () => {
  const dashboard = await readFile(new URL("../app/admin/admin-dashboard.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /paidOrderAlerts = orders\.filter/);
  assert.match(dashboard, /Payment received/);
  assert.match(dashboard, /admin-notification-icon payment/);
  assert.match(dashboard, /notificationCount/);
  assert.match(dashboard, /setOrderFilter\("to_pack"\)/);
});

test("admin product rows open the selected product editor", async () => {
  const dashboard = await readFile(new URL("../app/admin/admin-dashboard.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /function openProduct\(id: string\)/);
  assert.match(dashboard, /className="attention-row" key=\{product\.id\} onClick=\{\(\) => openProduct\(product\.id\)\}/);
  assert.match(dashboard, /setTab\("products"\)/);
});

test("admin refreshes orders while the overview is open", async () => {
  const [dashboard, ordersRoute] = await Promise.all([
    readFile(new URL("../app/admin/admin-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/orders/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(dashboard, /setInterval\(refreshOrders, 30_000\)/);
  assert.match(ordersRoute, /orderItems/);
  assert.match(ordersRoute, /itemsByOrder/);
});
