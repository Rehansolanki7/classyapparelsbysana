import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { productImages, products, productVariants } from "../db/schema";
import { canonicalProductSlug } from "./product-slug";

export type CatalogVariant = {
  id: number;
  size: string;
  sku: string;
  stock: number;
  active: boolean;
};

export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  eyebrow: string;
  price: number;
  compareAt: number;
  badge: string;
  description: string;
  includes: string;
  color: string;
  fabric: string;
  care: string;
  packedWeightGrams: number;
  status: "draft" | "active" | "archived";
  featured: boolean;
  source: "manual" | "instagram";
  images: string[];
  variants: CatalogVariant[];
};

export const FALLBACK_PRODUCT: CatalogProduct = {
  id: "sea-mist-set",
  slug: "sea-mist-3-piece-suit-set",
  name: "Sea Mist 3-Piece Suit Set",
  eyebrow: "The first Sana edit",
  price: 2499,
  compareAt: 2899,
  badge: "New drop",
  description:
    "A soft aqua three-piece set with whimsical florals, appliqué details and a statement printed dupatta. Easy to dress up, effortless to live in.",
  includes: "Kurta, trousers and printed dupatta",
  color: "Aqua",
  fabric: "",
  care: "Gentle hand wash separately in cold water. Dry in shade.",
  // The starter set weighs approximately 780 g including packaging. Production
  // products should still be checked and adjusted in Admin when needed.
  packedWeightGrams: 780,
  status: "active",
  featured: true,
  source: "manual",
  images: [
    "/products/sea-mist-01.webp",
    "/products/sea-mist-02.webp",
    "/products/sea-mist-03.webp",
    "/products/sea-mist-04.webp",
    "/products/sea-mist-05.webp",
    "/products/sea-mist-06.webp",
    "/products/sea-mist-07.webp",
  ],
  variants: ["S", "M", "L", "XL", "XXL", "XXXL", "4XL"].map((size, index) => ({
    id: index + 1,
    size,
    sku: `CAS-SEA-${size}`,
    stock: [3, 5, 5, 4, 3, 2, 1][index],
    active: true,
  })),
};

function fallbackAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_CATALOG_FALLBACK === "true";
}

function mapProduct(
  row: typeof products.$inferSelect,
  images: Array<typeof productImages.$inferSelect>,
  variants: Array<typeof productVariants.$inferSelect>,
): CatalogProduct {
  return {
    id: row.id,
    slug: canonicalProductSlug(row.name, row.slug, row.id),
    name: row.name,
    eyebrow: row.subtitle,
    price: row.pricePaise / 100,
    compareAt: (row.compareAtPaise ?? row.pricePaise) / 100,
    badge: row.status === "active" ? "New drop" : row.status,
    description: row.description,
    includes: row.includes,
    color: row.color,
    fabric: row.fabric,
    care: row.care,
    packedWeightGrams: row.packedWeightGrams,
    status: row.status,
    featured: row.featured,
    source: row.source,
    images: images.length ? images.map((image) => image.url) : [row.primaryImage].filter(Boolean),
    variants: variants.map((variant) => ({
      id: variant.id,
      size: variant.size,
      sku: variant.sku,
      stock: variant.stock,
      active: variant.active,
    })),
  };
}

export async function getFeaturedProduct(): Promise<CatalogProduct> {
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(products)
      .where(and(eq(products.status, "active"), eq(products.featured, true)))
      .limit(1);
    if (!row) {
      if (fallbackAllowed()) return FALLBACK_PRODUCT;
      throw new Error("No active featured product is configured");
    }
    const [images, variants] = await Promise.all([
      db.select().from(productImages).where(eq(productImages.productId, row.id)).orderBy(asc(productImages.position)),
      db.select().from(productVariants).where(eq(productVariants.productId, row.id)).orderBy(asc(productVariants.id)),
    ]);
    return mapProduct(row, images, variants);
  } catch (error) {
    if (fallbackAllowed()) return FALLBACK_PRODUCT;
    throw error;
  }
}

export async function getAllProducts(): Promise<CatalogProduct[]> {
  try {
    const db = getDb();
    const rows = await db.select().from(products).orderBy(asc(products.createdAt));
    const result: CatalogProduct[] = [];
    for (const row of rows) {
      const [images, variants] = await Promise.all([
        db.select().from(productImages).where(eq(productImages.productId, row.id)).orderBy(asc(productImages.position)),
        db.select().from(productVariants).where(eq(productVariants.productId, row.id)).orderBy(asc(productVariants.id)),
      ]);
      result.push(mapProduct(row, images, variants));
    }
    return result.length ? result : (fallbackAllowed() ? [FALLBACK_PRODUCT] : []);
  } catch (error) {
    if (fallbackAllowed()) return [FALLBACK_PRODUCT];
    throw error;
  }
}

export async function getProductBySlug(slug: string): Promise<CatalogProduct | null> {
  const all = await getAllProducts();
  const direct = all.find((product) => product.slug === slug);
  if (direct) return direct;

  const legacyIdPrefix = slug.match(/-([a-f0-9]{6})$/i)?.[1]?.toLowerCase();
  return legacyIdPrefix ? all.find((product) => product.id.toLowerCase().startsWith(legacyIdPrefix)) ?? null : null;
}
