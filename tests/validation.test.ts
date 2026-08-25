import assert from "node:assert/strict";
import test from "node:test";
import { canonicalProductSlug, productSlug } from "../lib/product-slug";
import { isValidIndianPincode, isValidInternationalPostalCode } from "../lib/shipping";
import { COUNTRIES, INDIA_STATES, countryName, normalizeCountryCode } from "../lib/locations";

test("Indian PIN validation rejects zero-prefixed and malformed values", () => {
  assert.equal(isValidIndianPincode("400001"), true);
  assert.equal(isValidIndianPincode("000000"), false);
  assert.equal(isValidIndianPincode("40000"), false);
  assert.equal(isValidIndianPincode("40000A"), false);
});

test("international destinations and complete Indian state options are available", () => {
  assert.equal(isValidInternationalPostalCode("SW1A 1AA"), true);
  assert.equal(isValidInternationalPostalCode("N/A"), true);
  assert.equal(isValidInternationalPostalCode("<bad>"), false);
  assert.equal(normalizeCountryCode("us"), "US");
  assert.equal(normalizeCountryCode("ZZ"), "");
  assert.equal(countryName("IN"), "India");
  assert.equal(COUNTRIES.length, 249);
  assert.equal(INDIA_STATES.length, 36);
  assert.equal(INDIA_STATES.includes("Ladakh"), true);
});

test("product slugs are normalized and legacy draft slugs are upgraded", () => {
  assert.equal(productSlug("  Blush Blossom – Set  "), "blush-blossom-set");
  assert.equal(canonicalProductSlug("Dove Grey", "untitled-product-a1b2c3", "a1b2c3-full-id"), "dove-grey");
  assert.equal(canonicalProductSlug("Sea Mist", "sea-mist", "id"), "sea-mist");
});
