import { normalizeCountryCode } from "./locations";
import { isValidIndianPincode, isValidInternationalPostalCode } from "./shipping";

export type AddressInput = {
  label?: string;
  recipientName?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  countryCode?: string;
  postalCode?: string;
  isDefault?: boolean;
};

function clean(value: string | undefined, maximum: number) {
  return (value ?? "").trim().replace(/[<>]/g, "").slice(0, maximum);
}

export function cleanProfileName(value: string | undefined) {
  return clean(value, 120);
}

export function validateAddress(input: AddressInput) {
  const countryCode = normalizeCountryCode(input.countryCode);
  const address = {
    label: clean(input.label, 40) || "Home",
    recipientName: clean(input.recipientName, 120),
    phone: clean(input.phone, 20).replace(/[^0-9+]/g, ""),
    addressLine1: clean(input.addressLine1, 220),
    addressLine2: clean(input.addressLine2, 220),
    city: clean(input.city, 100),
    state: clean(input.state, 100),
    countryCode,
    postalCode: countryCode === "IN"
      ? clean(input.postalCode, 20).replace(/\D/g, "")
      : clean(input.postalCode, 20).toUpperCase().replace(/[^A-Z0-9 /-]/g, ""),
    isDefault: Boolean(input.isDefault),
  };
  const phoneDigits = address.phone.replace(/\D/g, "");
  if (!address.recipientName || !address.phone || phoneDigits.length < 7 || phoneDigits.length > 15) return { error: "Enter a valid recipient name and phone number." } as const;
  if (address.addressLine1.length < 5 || !address.city || !address.state) return { error: "Enter the complete delivery address." } as const;
  if (!countryCode) return { error: "Select a valid country." } as const;
  if (countryCode === "IN" && !isValidIndianPincode(address.postalCode)) return { error: "Enter a valid 6-digit PIN code." } as const;
  if (countryCode !== "IN" && !isValidInternationalPostalCode(address.postalCode)) return { error: "Enter a valid postal or ZIP code." } as const;
  return { address } as const;
}
