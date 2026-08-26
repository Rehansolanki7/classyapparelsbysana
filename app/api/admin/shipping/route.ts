import { getDb } from "../../../../db";
import { pincodeRules, shippingRateCards } from "../../../../db/schema";
import { rejectUnlessAdmin } from "../../../../lib/admin-auth";
import { currentUser } from "../../../../lib/auth";
import { recordEvent } from "../../../../lib/logging";
import { getShippingConfiguration, SHIPPING_ZONES, type PincodeRule, type ShippingRateCard, type ShippingZone } from "../../../../lib/shipping";

const zones = new Set<string>(SHIPPING_ZONES);
const dbDate = (value: string | null | undefined) => value ? `${value.slice(0, 10)} 00:00:00` : null;

function integer(value: unknown, minimum: number, maximum: number) {
  const number = Math.floor(Number(value));
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : null;
}

function parseCards(value: unknown) {
  if (!Array.isArray(value) || value.length < 3 || value.length > 60) return { error: "Add at least one rate band for Mumbai, Maharashtra and the rest of India." } as const;
  const cards: Array<Omit<ShippingRateCard, "id">> = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return { error: "One of the shipping rate bands is invalid." } as const;
    const item = raw as Partial<ShippingRateCard>;
    if (!zones.has(String(item.zone))) return { error: "Choose a valid delivery zone for every rate band." } as const;
    const weightLimitGrams = integer(item.weightLimitGrams, 1, 50_000);
    const carrierChargePaise = integer(item.carrierChargePaise, 0, 1_000_000);
    const deliveryDaysMin = integer(item.deliveryDaysMin, 1, 30);
    const deliveryDaysMax = integer(item.deliveryDaysMax, 1, 45);
    if (weightLimitGrams === null || carrierChargePaise === null || deliveryDaysMin === null || deliveryDaysMax === null || deliveryDaysMax < deliveryDaysMin) return { error: "Check the weight, charge and delivery estimate for every rate band." } as const;
    const key = `${item.zone}:${weightLimitGrams}`;
    if (seen.has(key)) return { error: "Each zone can have only one rate for a weight band." } as const;
    seen.add(key);
    // Publishing is an explicit review action. Keep a date visible in admin so
    // stale public baseline rates can be revisited before customers see them.
    cards.push({ zone: item.zone as ShippingZone, weightLimitGrams, carrierChargePaise, deliveryDaysMin, deliveryDaysMax, serviceable: item.serviceable !== false, lastReviewedAt: dbDate(item.lastReviewedAt) ?? dbDate(new Date().toISOString()) });
  }
  for (const zone of SHIPPING_ZONES) if (!cards.some((card) => card.zone === zone)) return { error: "Keep at least one rate band in each delivery zone." } as const;
  return { cards } as const;
}

function parseRules(value: unknown) {
  if (!Array.isArray(value) || value.length > 500) return { error: "Too many PIN-code rules." } as const;
  const rules: Array<Omit<PincodeRule, "id">> = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return { error: "One of the PIN-code rules is invalid." } as const;
    const item = raw as Record<string, unknown>;
    const pincode = String(item.pincode ?? "").replace(/\D/g, "").slice(0, 6);
    if (!/^[1-9]\d{5}$/.test(pincode) || seen.has(pincode)) return { error: "Use each valid 6-digit PIN code only once." } as const;
    seen.add(pincode);
    const zone = item.zone === null || item.zone === undefined || item.zone === "" ? null : String(item.zone);
    if (zone !== null && !zones.has(zone)) return { error: "Choose a valid override zone or leave it on the default zone." } as const;
    const carrierChargePaise = item.carrierChargePaise === null || item.carrierChargePaise === undefined || item.carrierChargePaise === "" ? null : integer(item.carrierChargePaise, 0, 1_000_000);
    const deliveryDaysMin = item.deliveryDaysMin === null || item.deliveryDaysMin === undefined || item.deliveryDaysMin === "" ? null : integer(item.deliveryDaysMin, 1, 30);
    const deliveryDaysMax = item.deliveryDaysMax === null || item.deliveryDaysMax === undefined || item.deliveryDaysMax === "" ? null : integer(item.deliveryDaysMax, 1, 45);
    if (carrierChargePaise === null && item.carrierChargePaise !== null && item.carrierChargePaise !== undefined && item.carrierChargePaise !== "") return { error: "PIN-code carrier overrides must be valid non-negative amounts." } as const;
    if ((deliveryDaysMin === null) !== (deliveryDaysMax === null) || (deliveryDaysMin !== null && deliveryDaysMax !== null && deliveryDaysMax < deliveryDaysMin)) return { error: "PIN-code delivery estimates need a valid minimum and maximum." } as const;
    rules.push({ pincode, zone: zone as ShippingZone | null, serviceable: item.serviceable !== false, manualQuoteRequired: Boolean(item.manualQuoteRequired), carrierChargePaise, deliveryDaysMin, deliveryDaysMax, note: String(item.note ?? "").trim().replace(/[<>]/g, "").slice(0, 300) });
  }
  return { rules } as const;
}

export async function GET(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;
  try {
    return Response.json(await getShippingConfiguration(), { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "Shipping settings are unavailable until the latest database migration has run." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;
  try {
    const payload = await request.json() as { cards?: unknown; pincodeRules?: unknown };
    const parsedCards = parseCards(payload.cards);
    if ("error" in parsedCards) return Response.json(parsedCards, { status: 400 });
    const parsedRules = parseRules(payload.pincodeRules);
    if ("error" in parsedRules) return Response.json(parsedRules, { status: 400 });
    const db = getDb();
    await db.transaction(async (tx) => {
      await tx.delete(shippingRateCards);
      await tx.delete(pincodeRules);
      await tx.insert(shippingRateCards).values(parsedCards.cards);
      if (parsedRules.rules.length) await tx.insert(pincodeRules).values(parsedRules.rules);
    });
    const user = await currentUser();
    await recordEvent({ severity: "info", eventType: "admin.shipping_rates_published", actorId: user?.id, entityType: "shipping_rate_cards", entityId: String(parsedCards.cards.length) });
    return Response.json(await getShippingConfiguration());
  } catch {
    await recordEvent({ severity: "error", eventType: "admin.shipping_rates_publish_failed" });
    return Response.json({ error: "We could not publish the shipping rates. Please try again." }, { status: 500 });
  }
}
