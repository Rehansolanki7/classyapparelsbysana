import { rejectUnlessAdmin } from "../../../../lib/admin-auth";
import { currentUser } from "../../../../lib/auth";
import { recordEvent } from "../../../../lib/logging";
import { defaultStorefrontSettings, getStorefrontSettings, saveStorefrontSettings, type StorefrontSettings } from "../../../../lib/storefront-settings";

const limits: Record<keyof StorefrontSettings, number> = {
  promotionText: 160,
  promotionCtaLabel: 80,
  promotionCtaHref: 240,
  heroKicker: 160,
  heroHeading: 160,
  heroAccent: 160,
  heroBody: 500,
  storyHeading: 160,
  storyBody: 800,
  newsletterHeading: 160,
  newsletterBody: 500,
};

const unsupportedShippingClaim = /\b(?:complimentary|free)\s+(?:shipping|delivery)\b|\bfree\s+ship\b/i;

function clean(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().replace(/[<>]/g, "").slice(0, maximum) : "";
}

function isInternalDestination(value: string) {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !/\s/.test(value);
}

export async function GET(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;
  return Response.json({ settings: await getStorefrontSettings() });
}

export async function PATCH(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;
  try {
    const payload = await request.json() as Partial<StorefrontSettings>;
    const settings = Object.fromEntries(Object.entries(limits).map(([key, maximum]) => [key, clean(payload[key as keyof StorefrontSettings], maximum) || defaultStorefrontSettings[key as keyof StorefrontSettings]])) as StorefrontSettings;
    if (!isInternalDestination(settings.promotionCtaHref)) {
      return Response.json({ error: "Promotion links must stay on this website (for example, /shop)." }, { status: 400 });
    }
    const copy = Object.values(settings).filter((value) => typeof value === "string").join(" ");
    if (unsupportedShippingClaim.test(copy)) {
      return Response.json({ error: "This storefront does not currently offer free or complimentary shipping. Publish a truthful shipping message instead." }, { status: 400 });
    }
    await saveStorefrontSettings(settings);
    const user = await currentUser();
    await recordEvent({ severity: "info", eventType: "admin.storefront_content_updated", actorId: user?.id });
    return Response.json({ ok: true, settings });
  } catch {
    return Response.json({ error: "We could not save storefront content. Please try again." }, { status: 500 });
  }
}
