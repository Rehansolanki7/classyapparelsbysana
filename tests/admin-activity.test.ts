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
