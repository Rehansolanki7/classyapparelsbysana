import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("large product photos get several compression attempts and a safe upload response", async () => {
  const [dashboard, media] = await Promise.all([
    readFile(new URL("../app/admin/admin-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/media/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(dashboard, /TARGET_UPLOAD_BYTES = 3\.5 \* 1024 \* 1024/);
  assert.match(dashboard, /const qualities = \[0\.82, 0\.72, 0\.62/);
  assert.match(dashboard, /MIN_IMAGE_EDGE/);
  assert.match(media, /request\.formData\(\)/);
  assert.match(media, /status: 413/);
});

test("captured paid orders can be marked shipped before tracking is available", async () => {
  const [api, dashboard] = await Promise.all([
    readFile(new URL("../app/api/admin/orders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/admin-dashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(api, /order\.paymentStatus !== "captured"/);
  assert.doesNotMatch(api, /Courier name and tracking number are required before marking an order shipped/);
  assert.match(dashboard, /order\.status === "paid" \|\| order\.status === "processing" \? "shipped"/);
  assert.match(dashboard, /can be added later/);
});

test("home categories link to the existing category-filtered shop", async () => {
  const [home, storefront, checkout, product, shop, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/checkout/checkout-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/products/[slug]/product-detail.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/shop/shop-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(home, /getManagedCategories/);
  assert.match(storefront, /category-showcase/);
  assert.match(storefront, /\/shop\?category=\$\{encodeURIComponent\(category\.slug\)\}/);
  assert.match(checkout, /Shipping is added at this step/);
  assert.match(product, /Shipping is calculated from your delivery address/);
  assert.match(shop, /Shipping is calculated from your delivery address at checkout/);
  assert.match(css, /\.category-track/);
  assert.match(storefront, /WHATSAPP_COMMUNITY_URL/);
});

test("admin can choose homepage categories and mark products as no-size", async () => {
  const [schema, categoriesApi, productsApi, admin, storefront, shop, checkout, product] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/categories/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/products/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/admin-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/shop/shop-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/checkout/checkout-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/products/[slug]/product-detail.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /showOnHomepage: boolean\("show_on_homepage"\)/);
  assert.match(schema, /hasSizes: boolean\("has_sizes"\)/);
  assert.match(categoriesApi, /showOnHomepage\?: boolean/);
  assert.match(productsApi, /hasSizes\?: boolean/);
  assert.match(productsApi, /size: "One size"/);
  assert.match(admin, /Show on homepage/);
  assert.match(admin, /This product has sizes/);
  assert.match(storefront, /product\.hasSizes \? </);
  assert.match(shop, /Free-size · no size needed/);
  assert.match(checkout, /No size needed/);
  assert.match(product, /Free-size \/ unstitched piece/);
  assert.match(storefront, /variant\.active && variant\.stock > 0/);
  assert.match(product, /variant\.active && variant\.stock > 0/);
});
