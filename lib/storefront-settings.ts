import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { storefrontSettings } from "../db/schema";

export type StorefrontSettings = {
  promotionText: string;
  promotionCtaLabel: string;
  promotionCtaHref: string;
  featuredProductId: string;
  featuredKicker: string;
  featuredHeroImageUrl: string;
  collectionKicker: string;
  collectionHeading: string;
  collectionBody: string;
  detailKicker: string;
  detailHeading: string;
  detailBody: string;
  detailPrimaryImageUrl: string;
  detailSecondaryImageUrl: string;
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
  featuredProductId: "",
  featuredKicker: "Just arrived",
  featuredHeroImageUrl: "",
  collectionKicker: "New arrival",
  collectionHeading: "Made to be noticed. Easy enough for every day.",
  collectionBody: "Our drops are intentionally small. Each piece is photographed honestly so you can see the colour, fall and finishing before you choose.",
  detailKicker: "The detail edit",
  detailHeading: "Thoughtful details, seen up close.",
  detailBody: "",
  detailPrimaryImageUrl: "",
  detailSecondaryImageUrl: "",
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
      featuredProductId: settings.featuredProductId,
      featuredKicker: settings.featuredKicker || defaultStorefrontSettings.featuredKicker,
      featuredHeroImageUrl: settings.featuredHeroImageUrl,
      collectionKicker: settings.collectionKicker || defaultStorefrontSettings.collectionKicker,
      collectionHeading: settings.collectionHeading || defaultStorefrontSettings.collectionHeading,
      collectionBody: settings.collectionBody || defaultStorefrontSettings.collectionBody,
      detailKicker: settings.detailKicker || defaultStorefrontSettings.detailKicker,
      detailHeading: settings.detailHeading || defaultStorefrontSettings.detailHeading,
      detailBody: settings.detailBody,
      detailPrimaryImageUrl: settings.detailPrimaryImageUrl,
      detailSecondaryImageUrl: settings.detailSecondaryImageUrl,
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
