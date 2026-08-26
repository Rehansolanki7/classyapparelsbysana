import assert from "node:assert/strict";
import test from "node:test";
import { calculateShippingFromCards, shippingForDestination, type ShippingRateCard } from "../lib/shipping";

const cards: ShippingRateCard[] = [
  { id: 1, zone: "mumbai_local", weightLimitGrams: 500, carrierChargePaise: 2800, deliveryDaysMin: 2, deliveryDaysMax: 4, serviceable: true, lastReviewedAt: null },
  { id: 2, zone: "mumbai_local", weightLimitGrams: 1000, carrierChargePaise: 4800, deliveryDaysMin: 2, deliveryDaysMax: 4, serviceable: true, lastReviewedAt: null },
  { id: 3, zone: "maharashtra", weightLimitGrams: 500, carrierChargePaise: 6500, deliveryDaysMin: 3, deliveryDaysMax: 6, serviceable: true, lastReviewedAt: null },
  { id: 4, zone: "maharashtra", weightLimitGrams: 1000, carrierChargePaise: 9100, deliveryDaysMin: 3, deliveryDaysMax: 6, serviceable: true, lastReviewedAt: null },
  { id: 5, zone: "rest_of_india", weightLimitGrams: 500, carrierChargePaise: 7200, deliveryDaysMin: 4, deliveryDaysMax: 8, serviceable: true, lastReviewedAt: null },
  { id: 6, zone: "rest_of_india", weightLimitGrams: 1000, carrierChargePaise: 11400, deliveryDaysMin: 4, deliveryDaysMax: 8, serviceable: true, lastReviewedAt: null },
];

test("shipping adds ₹50 once and rounds the complete cart up to a destination band", () => {
  const mumbai = calculateShippingFromCards({ cards, pincode: "400001", pincodeRule: { id: 1, pincode: "400001", zone: "mumbai_local", serviceable: true, manualQuoteRequired: false, carrierChargePaise: null, deliveryDaysMin: null, deliveryDaysMax: null, note: "" }, cartWeightGrams: 320 });
  const maharashtra = calculateShippingFromCards({ cards, pincode: "411001", state: "Maharashtra", cartWeightGrams: 780 });
  const rest = calculateShippingFromCards({ cards, pincode: "560001", state: "Karnataka", cartWeightGrams: 420 });
  assert.deepEqual({ serviceable: mumbai.serviceable, shipping: mumbai.shippingPaise, billed: mumbai.billedWeightGrams }, { serviceable: true, shipping: 7800, billed: 500 });
  assert.deepEqual({ shipping: maharashtra.shippingPaise, billed: maharashtra.billedWeightGrams }, { shipping: 14100, billed: 1000 });
  assert.deepEqual({ shipping: rest.shippingPaise, billed: rest.billedWeightGrams }, { shipping: 12200, billed: 500 });
});

test("unserviceable destinations and weights above the configured maximum require a manual quote", () => {
  const blocked = calculateShippingFromCards({ cards, pincode: "400001", cartWeightGrams: 300, pincodeRule: { id: 1, pincode: "400001", zone: null, serviceable: false, manualQuoteRequired: false, carrierChargePaise: null, deliveryDaysMin: null, deliveryDaysMax: null, note: "Remote delivery review" } });
  const oversized = calculateShippingFromCards({ cards, pincode: "560001", state: "Karnataka", cartWeightGrams: 1100 });
  assert.equal(blocked.serviceable, false);
  assert.equal(blocked.manualQuoteRequired, true);
  assert.equal(oversized.manualQuoteRequired, true);
});

test("international delivery stays a manual quote before payment", async () => {
  const manual = await shippingForDestination("GB", "SW1A 1AA", { cartWeightGrams: 500 });
  assert.equal(manual.serviceable, false);
  assert.equal(manual.manualQuoteRequired, true);
});
