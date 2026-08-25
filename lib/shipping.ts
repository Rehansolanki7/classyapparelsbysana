import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { pincodeRules } from "../db/schema";
import { normalizeCountryCode } from "./locations";

export type Serviceability = {
  serviceable: boolean;
  manualQuoteRequired: boolean;
  shippingPaise: number;
  deliveryDaysMin: number;
  deliveryDaysMax: number;
  note: string;
};

export function isValidIndianPincode(value: string) {
  return /^[1-9][0-9]{5}$/.test(value);
}

export function isValidInternationalPostalCode(value: string) {
  const postalCode = value.trim();
  return postalCode.length >= 2 && postalCode.length <= 16 && /^[A-Za-z0-9][A-Za-z0-9 /-]*$/.test(postalCode);
}

function configuredInternationalShipping() {
  const value = process.env.INTERNATIONAL_SHIPPING_PAISE?.trim();
  if (!value || !/^\d+$/.test(value)) return null;
  const paise = Number(value);
  return Number.isSafeInteger(paise) && paise >= 0 && paise <= 10_000_000 ? paise : null;
}

function domesticFallback(valid: boolean, subtotalPaise: number): Serviceability {
  return {
    serviceable: valid,
    manualQuoteRequired: false,
    shippingPaise: subtotalPaise >= 149900 ? 0 : 9900,
    deliveryDaysMin: 4,
    deliveryDaysMax: 8,
    note: valid ? "Delivery is available across India and will be arranged manually." : "Enter a valid Indian PIN code.",
  };
}

export async function shippingForDestination(countryCodeInput: string, postalCodeInput: string, subtotalPaise = 0): Promise<Serviceability> {
  const countryCode = normalizeCountryCode(countryCodeInput);
  if (!countryCode) return { serviceable: false, manualQuoteRequired: false, shippingPaise: 0, deliveryDaysMin: 0, deliveryDaysMax: 0, note: "Select a valid country." };

  if (countryCode !== "IN") {
    if (!isValidInternationalPostalCode(postalCodeInput)) {
      return { serviceable: false, manualQuoteRequired: false, shippingPaise: 0, deliveryDaysMin: 0, deliveryDaysMax: 0, note: "Enter a valid postal or ZIP code. Use N/A where your country has no postal codes." };
    }
    const shippingPaise = configuredInternationalShipping();
    if (shippingPaise === null) {
      return {
        serviceable: false,
        manualQuoteRequired: true,
        shippingPaise: 0,
        deliveryDaysMin: 7,
        deliveryDaysMax: 21,
        note: "International delivery is available. Message Sana for a manual shipping quote before payment.",
      };
    }
    return {
      serviceable: true,
      manualQuoteRequired: false,
      shippingPaise,
      deliveryDaysMin: 7,
      deliveryDaysMax: 21,
      note: "International delivery is available and will be arranged manually.",
    };
  }

  const pincode = postalCodeInput.replace(/\D/g, "").slice(0, 6);
  const valid = isValidIndianPincode(pincode);
  const fallback = domesticFallback(valid, subtotalPaise);
  if (!valid) return fallback;
  try {
    const db = getDb();
    const [rule] = await db.select().from(pincodeRules).where(eq(pincodeRules.pincode, pincode)).limit(1);
    if (!rule) return fallback;
    return {
      serviceable: true,
      manualQuoteRequired: false,
      shippingPaise: rule.shippingPaise ?? fallback.shippingPaise,
      deliveryDaysMin: rule.deliveryDaysMin ?? fallback.deliveryDaysMin,
      deliveryDaysMax: rule.deliveryDaysMax ?? fallback.deliveryDaysMax,
      note: rule.serviceable && rule.note ? rule.note : fallback.note,
    };
  } catch {
    return fallback;
  }
}

export async function shippingForPincode(pincodeInput: string, subtotalPaise = 0) {
  return shippingForDestination("IN", pincodeInput, subtotalPaise);
}
