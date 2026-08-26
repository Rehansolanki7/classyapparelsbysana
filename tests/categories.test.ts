import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { categorySlug } from "../lib/categories";

test("category slugs are compact, stable and URL safe", () => {
  assert.equal(categorySlug("Pakistani Suits"), "pakistani-suits");
  assert.equal(categorySlug("  Kaftans & Abayas  "), "kaftans-abayas");
  assert.equal(categorySlug("Été Collection"), "ete-collection");
});

test("managed-category migration retains the legacy category values", async () => {
  const root = new URL("../", import.meta.url);
  const migration = await readFile(new URL("drizzle-hostinger/0008_managed_categories.sql", root), "utf8");

  assert.match(migration, /CREATE TABLE `categories`/);
  assert.match(migration, /ADD COLUMN `category_id`/);
  assert.match(migration, /SELECT DISTINCT TRIM\(`category`\)/);
  assert.match(migration, /UPDATE `products`[\s\S]*SET `category_id`/);
});
