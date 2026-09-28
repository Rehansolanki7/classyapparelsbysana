import { asc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { internationalShippingRates } from "../../../../db/schema";
import { rejectUnlessAdmin } from "../../../../lib/admin-auth";
import { currentUser } from "../../../../lib/auth";
import { normalizeCountryCode } from "../../../../lib/locations";
import { recordEvent } from "../../../../lib/logging";
import { getInternationalShippingConfiguration } from "../../../../lib/shipping";
import type { InternationalShippingRate } from "../../../../lib/shipping-types";

function integer(value: unknown, minimum: number, maximum: number) {
  const number = Math.floor(Number(value));
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : null;
}

function dbDate(value: string | null | undefined) {
  return value ? `${value.slice(0, 10)} 00:00:00` : null;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10) + " 00:00:00";
}

function parseRates(value: unknown) {
  if (!Array.isArray(value) || value.length > 250) return { error: "Add no more than 250 international country rates." } as const;
  const rates: Array<Omit<InternationalShippingRate, "id">> = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return { error: "One of the international shipping rates is invalid." } as const;
    const item = raw as Record<string, unknown>;
    const countryCode = normalizeCountryCode(String(item.countryCode ?? ""));
    if (!countryCode || countryCode === "IN") return { error: "Choose a valid non-India country for every international rate." } as const;
    if (seen.has(countryCode)) return { error: "Each country can have only one international courier rate." } as const;
    seen.add(countryCode);
    const pricePer500gPaise = integer(item.pricePer500gPaise, 1, 10_000_000);
    const deliveryDaysMin = integer(item.deliveryDaysMin, 1, 90);
    const deliveryDaysMax = integer(item.deliveryDaysMax, 1, 120);
    if (pricePer500gPaise === null || deliveryDaysMin === null || deliveryDaysMax === null || deliveryDaysMax < deliveryDaysMin) {
      return { error: "Check the courier price and delivery estimate for every country." } as const;
    }
    rates.push({
      countryCode,
      pricePer500gPaise,
      deliveryDaysMin,
      deliveryDaysMax,
      courierName: String(item.courierName ?? "").trim().replace(/[<>]/g, "").slice(0, 100),
      serviceable: item.serviceable !== false,
      lastReviewedAt: dbDate(typeof item.lastReviewedAt === "string" ? item.lastReviewedAt : null) ?? todayDate(),
    });
  }
  return { rates } as const;
}

export async function GET(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;
  try {
    return Response.json(await getInternationalShippingConfiguration(), { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "International shipping settings are unavailable until the latest database migration has run." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;
  try {
    const payload = await request.json() as { rates?: unknown };
    const parsed = parseRates(payload.rates);
    if ("error" in parsed) return Response.json(parsed, { status: 400 });
    const db = getDb();
    await db.transaction(async (tx) => {
      await tx.delete(internationalShippingRates);
      if (parsed.rates.length) await tx.insert(internationalShippingRates).values(parsed.rates);
    });
    const user = await currentUser();
    await recordEvent({ severity: "info", eventType: "admin.international_shipping_rates_published", actorId: user?.id, entityType: "international_shipping_rates", entityId: String(parsed.rates.length) });
    const saved = await db.select().from(internationalShippingRates).orderBy(asc(internationalShippingRates.countryCode));
    return Response.json({ rates: saved, weightStepGrams: 500 });
  } catch {
    await recordEvent({ severity: "error", eventType: "admin.international_shipping_rates_publish_failed" });
    return Response.json({ error: "We could not publish the international shipping rates. Please try again." }, { status: 500 });
  }
}
