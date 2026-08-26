import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { storefrontSettings } from "../db/schema";

export type StorefrontSettings = {
  promotionText: string;
  promotionCtaLabel: string;
  promotionCtaHref: string;
  heroKicker: string;
  heroHeading: string;
  heroAccent: string;
  heroBody: string;
  storyHeading: string;
  storyBody: string;
  newsletterHeading: string;
  newsletterBody: string;
};

export const defaultStorefrontSettings: StorefrontSettings = {
  promotionText: "A considered collection, chosen with care.",
  promotionCtaLabel: "Explore the collection",
  promotionCtaHref: "/shop",
  heroKicker: "Boutique pieces · selected in Mumbai",
  heroHeading: "Wear the moment.",
  heroAccent: "Keep the feeling.",
  heroBody: "Limited, considered pieces for women who love colour, comfort and a little quiet drama.",
  storyHeading: "Fashion should feel personal.",
  storyBody: "Classy Apparels by Sana began as an Instagram boutique built around a simple idea: share lovely pieces honestly, answer every sizing question with care, and make shopping feel like talking to someone you trust.",
  newsletterHeading: "First look at every new drop.",
  newsletterBody: "Message “JOIN” on WhatsApp for launch alerts, restocks and private previews.",
};

export async function getStorefrontSettings(): Promise<StorefrontSettings> {
  try {
    const db = getDb();
    const [settings] = await db.select().from(storefrontSettings).where(eq(storefrontSettings.id, 1)).limit(1);
    if (!settings) return defaultStorefrontSettings;
    return {
      promotionText: settings.promotionText || defaultStorefrontSettings.promotionText,
      promotionCtaLabel: settings.promotionCtaLabel || defaultStorefrontSettings.promotionCtaLabel,
      promotionCtaHref: settings.promotionCtaHref || defaultStorefrontSettings.promotionCtaHref,
      heroKicker: settings.heroKicker,
      heroHeading: settings.heroHeading,
      heroAccent: settings.heroAccent,
      heroBody: settings.heroBody,
      storyHeading: settings.storyHeading,
      storyBody: settings.storyBody,
      newsletterHeading: settings.newsletterHeading,
      newsletterBody: settings.newsletterBody,
    };
  } catch {
    return defaultStorefrontSettings;
  }
}

export async function saveStorefrontSettings(input: StorefrontSettings) {
  const db = getDb();
  await db
    .insert(storefrontSettings)
    .values({
      id: 1,
      ...input,
      // Kept in sync while older deployments still have the legacy columns.
      announcementPrimary: input.promotionText,
      announcementSecondary: "",
    })
    .onDuplicateKeyUpdate({ set: { ...input, announcementPrimary: input.promotionText, announcementSecondary: "", updatedAt: sql`CURRENT_TIMESTAMP` } });
}
