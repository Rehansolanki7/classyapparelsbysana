import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("inventory release uses MySQL scalar GREATEST instead of aggregate MAX", async () => {
  const source = await readFile(new URL("../lib/orders.ts", import.meta.url), "utf8");
  assert.equal(source.includes("MAX(0"), false);
  assert.equal(source.includes("GREATEST(0"), true);
});
