import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mobile Admin navigation uses the accessible drawer instead of a scrolling bottom bar", async () => {
  const root = new URL("../", import.meta.url);
  const dashboard = await readFile(new URL("app/admin/admin-dashboard.tsx", root), "utf8");
  const styles = await readFile(new URL("app/globals.css", root), "utf8");

  assert.match(dashboard, /useOverlayDialog/);
  assert.match(dashboard, /admin-mobile-drawer/);
  assert.match(styles, /\.admin-mobile-drawer \{ position: fixed/);
  assert.doesNotMatch(styles, /\.admin-shell \{ display: block; padding-bottom: 72px; \}/);
});
