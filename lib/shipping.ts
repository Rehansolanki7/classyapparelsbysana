import { asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { pincodeRules, shippingRateCards } from "../db/schema";
import { normalizeCountryCode } from "./locations";
import { type PincodeRule, type ShippingRateCard, type ShippingZone } from "./shipping-types";

export { SHIPPING_ZONES, type PincodeRule, type ShippingRateCard, type ShippingZone } from "./shipping-types";

export const SHIPPING_HANDLING_PAISE = 5_000;

export type Serviceability = {
  serviceable: boolean;
  manualQuoteRequired: boolean;
  shippingPaise: number;
  carrierChargePaise: number;
  handlingPaise: number;
  cartWeightGrams: number;
  billedWeightGrams: number | null;
  zone: ShippingZone | null;
  deliveryDaysMin: number;
  deliveryDaysMax: number;
  note: string;
};

export type ShippingDestination = { cartWeightGrams?: number; state?: string };

export function isValidIndianPincode(value: string) {
  return /^[1-9][0-9]{5}$/.test(value);
}

export function isValidInternationalPostalCode(value: string) {
  const postalCode = value.trim();
  return postalCode.length >= 2 && postalCode.length <= 16 && /^[A-Za-z0-9][A-Za-z0-9 /-]*$/.test(postalCode);
}

function result(overrides: Partial<Serviceability>): Serviceability {
  return {
    serviceable: false,
    manualQuoteRequired: false,
    shippingPaise: 0,
    carrierChargePaise: 0,
    handlingPaise: 0,
    cartWeightGrams: 0,
    billedWeightGrams: null,
    zone: null,
    deliveryDaysMin: 0,
    deliveryDaysMax: 0,
    note: "We could not confirm delivery for this address.",
    ...overrides,
  };
}

function normalizeWeight(value: number | undefined) {
  const weight = Math.ceil(Number(value) || 0);
  return Number.isSafeInteger(weight) && weight > 0 && weight <= 50_000 ? weight : 0;
}

function defaultZone(state: string | undefined, pincode: string): ShippingZone {
  // 400xxx PIN codes cover Mumbai. Prefer the PIN when available so a Mumbai
  // destination does not fall into the broader Maharashtra rate band merely
  // because the customer selected Maharashtra as the state.
  if (pincode.startsWith("400")) return "mumbai_local";
  if (state?.trim().toLowerCase() === "maharashtra") return "maharashtra";
  // Explicit admin PIN rules always win; this is only a backwards-compatible
  // fallback for an older client that did not submit state.
  const prefix = Number(pincode.slice(0, 3));
  return prefix >= 400 && prefix <= 449 ? "maharashtra" : "rest_of_india";
}

function asRateCard(row: typeof shippingRateCards.$inferSelect): ShippingRateCard {
  return {
    id: row.id,
    zone: row.zone,
    weightLimitGrams: row.weightLimitGrams,
    carrierChargePaise: row.carrierChargePaise,
    deliveryDaysMin: row.deliveryDaysMin,
    deliveryDaysMax: row.deliveryDaysMax,
    serviceable: row.serviceable,
    lastReviewedAt: row.lastReviewedAt,
  };
}

function asPincodeRule(row: typeof pincodeRules.$inferSelect): PincodeRule {
  return {
    id: row.id,
    pincode: row.pincode,
    zone: row.zone,
    serviceable: row.serviceable,
    carrierChargePaise: row.carrierChargePaise,
    manualQuoteRequired: row.manualQuoteRequired,
    deliveryDaysMin: row.deliveryDaysMin,
    deliveryDaysMax: row.deliveryDaysMax,
    note: row.note,
  };
}

export async function getShippingConfiguration() {
  const db = getDb();
  const [cardRows, ruleRows] = await Promise.all([
    db.select().from(shippingRateCards).orderBy(asc(shippingRateCards.zone), asc(shippingRateCards.weightLimitGrams)),
    db.select().from(pincodeRules).orderBy(asc(pincodeRules.pincode)),
  ]);
  return { cards: cardRows.map(asRateCard), pincodeRules: ruleRows.map(asPincodeRule), handlingPaise: SHIPPING_HANDLING_PAISE };
}

export function calculateShippingFromCards({
  cards,
  pincodeRule,
  state,
  pincode,
  cartWeightGrams,
}: {
  cards: ShippingRateCard[];
  pincodeRule?: PincodeRule | null;
  state?: string;
  pincode: string;
  cartWeightGrams: number;
}): Serviceability {
  const weight = normalizeWeight(cartWeightGrams);
  if (!weight) {
    return result({ manualQuoteRequired: true, note: "This order needs a confirmed packed weight before payment. Please message Sana for a delivery quote." });
  }
  if (pincodeRule && (!pincodeRule.serviceable || pincodeRule.manualQuoteRequired)) {
    return result({
      manualQuoteRequired: true,
      cartWeightGrams: weight,
      zone: pincodeRule.zone ?? defaultZone(state, pincode),
      deliveryDaysMin: pincodeRule.deliveryDaysMin ?? 0,
      deliveryDaysMax: pincodeRule.deliveryDaysMax ?? 0,
      note: pincodeRule.note || "Delivery to this PIN code needs a manual WhatsApp quote before payment.",
    });
  }

  const zone = pincodeRule?.zone ?? defaultZone(state, pincode);
  const rateCard = cards
    .filter((card) => card.zone === zone && card.serviceable && card.weightLimitGrams >= weight)
    .sort((left, right) => left.weightLimitGrams - right.weightLimitGrams)[0];
  if (!rateCard) {
    return result({
      manualQuoteRequired: true,
      cartWeightGrams: weight,
      zone,
      note: "This parcel is outside the configured delivery-weight bands. Message Sana for a manual WhatsApp quote before payment.",
    });
  }

  const carrierChargePaise = pincodeRule?.carrierChargePaise ?? rateCard.carrierChargePaise;
  return result({
    serviceable: true,
    cartWeightGrams: weight,
    billedWeightGrams: rateCard.weightLimitGrams,
    zone,
    carrierChargePaise,
    handlingPaise: SHIPPING_HANDLING_PAISE,
    shippingPaise: carrierChargePaise + SHIPPING_HANDLING_PAISE,
    deliveryDaysMin: pincodeRule?.deliveryDaysMin ?? rateCard.deliveryDaysMin,
    deliveryDaysMax: pincodeRule?.deliveryDaysMax ?? rateCard.deliveryDaysMax,
    note: pincodeRule?.note || `Shipping is calculated for a ${rateCard.weightLimitGrams} g packed-weight band and this delivery destination.`,
  });
}

/** Quotes domestic shipping from admin-maintained rate cards, never a spend threshold. */
export async function shippingForDestination(countryCodeInput: string, postalCodeInput: string, destination: ShippingDestination = {}): Promise<Serviceability> {
  const countryCode = normalizeCountryCode(countryCodeInput);
  if (!countryCode) return result({ note: "Select a valid country." });

  if (countryCode !== "IN") {
    if (!isValidInternationalPostalCode(postalCodeInput)) return result({ note: "Enter a valid postal or ZIP code. Use N/A where your country has no postal codes." });
    return result({ manualQuoteRequired: true, cartWeightGrams: normalizeWeight(destination.cartWeightGrams), note: "International delivery is arranged by manual WhatsApp quote before payment." });
  }

  const pincode = postalCodeInput.replace(/\D/g, "").slice(0, 6);
  if (!isValidIndianPincode(pincode)) return result({ note: "Enter a valid 6-digit Indian PIN code." });
  try {
    const db = getDb();
    const [ruleRows, cardRows] = await Promise.all([
      db.select().from(pincodeRules).where(eq(pincodeRules.pincode, pincode)).limit(1),
      db.select().from(shippingRateCards),
    ]);
    return calculateShippingFromCards({
      cards: cardRows.map(asRateCard),
      pincodeRule: ruleRows[0] ? asPincodeRule(ruleRows[0]) : null,
      state: destination.state,
      pincode,
      cartWeightGrams: destination.cartWeightGrams ?? 0,
    });
  } catch {
    return result({ manualQuoteRequired: true, cartWeightGrams: normalizeWeight(destination.cartWeightGrams), note: "Shipping rates are being reviewed. Message Sana for a manual WhatsApp quote before payment." });
  }
}

export async function shippingForPincode(pincodeInput: string, cartWeightGrams = 0, state?: string) {
  return shippingForDestination("IN", pincodeInput, { cartWeightGrams, state });
}
