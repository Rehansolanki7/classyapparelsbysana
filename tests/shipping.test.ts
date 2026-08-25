import assert from "node:assert/strict";
import test from "node:test";
import { shippingForDestination } from "../lib/shipping";

test("every valid Indian PIN remains serviceable when delivery is handled manually", async () => {
  const previousDbHost = process.env.DB_HOST;
  delete process.env.DB_HOST;
  try {
    const regular = await shippingForDestination("IN", "400001", 100_000);
    const complimentary = await shippingForDestination("IN", "791001", 149_900);
    const invalid = await shippingForDestination("IN", "000000", 100_000);
    assert.equal(regular.serviceable, true);
    assert.equal(regular.shippingPaise, 9_900);
    assert.equal(complimentary.serviceable, true);
    assert.equal(complimentary.shippingPaise, 0);
    assert.equal(invalid.serviceable, false);
  } finally {
    if (previousDbHost === undefined) delete process.env.DB_HOST;
    else process.env.DB_HOST = previousDbHost;
  }
});

test("international delivery requests a manual quote until a reviewed rate is configured", async () => {
  const previousRate = process.env.INTERNATIONAL_SHIPPING_PAISE;
  try {
    delete process.env.INTERNATIONAL_SHIPPING_PAISE;
    const manual = await shippingForDestination("GB", "SW1A 1AA", 200_000);
    assert.equal(manual.serviceable, false);
    assert.equal(manual.manualQuoteRequired, true);

    process.env.INTERNATIONAL_SHIPPING_PAISE = "249900";
    const configured = await shippingForDestination("US", "10001", 200_000);
    assert.equal(configured.serviceable, true);
    assert.equal(configured.manualQuoteRequired, false);
    assert.equal(configured.shippingPaise, 249_900);
  } finally {
    if (previousRate === undefined) delete process.env.INTERNATIONAL_SHIPPING_PAISE;
    else process.env.INTERNATIONAL_SHIPPING_PAISE = previousRate;
  }
});
