import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { productImages, products, productVariants } from "../../../../db/schema";
import { rejectUnlessAdmin } from "../../../../lib/admin-auth";
import { getAllProducts } from "../../../../lib/catalog";
import { productSlug } from "../../../../lib/product-slug";
import { notifyRestock } from "../../../../lib/restock";

const allowedStatuses = new Set(["draft", "active", "archived"]);

function safeImages(values: Array<string | undefined> | undefined) {
  const images = (values ?? []).filter((value): value is string => typeof value === "string" && (/^\/(media|uploads|products)\//.test(value)));
  return [...new Set(images)].slice(0, 12);
}

export async function GET(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;
  return Response.json({ products: await getAllProducts() });
}

export async function POST(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;

  const payload = (await request.json()) as { name?: string; imageUrl?: string };
  const name = payload.name?.trim().slice(0, 120) || "Untitled product";
  const id = crypto.randomUUID();
  const imageUrl = payload.imageUrl?.startsWith("/") ? payload.imageUrl : "";
  const db = getDb();
  const baseSlug = productSlug(name) || `product-${id.slice(0, 6)}`;
  const [conflict] = await db.select({ id: products.id }).from(products).where(eq(products.slug, baseSlug)).limit(1);
  const slug = conflict ? `${baseSlug}-${id.slice(0, 6)}` : baseSlug;

  await db.transaction(async (tx) => {
    await tx.insert(products).values({
      id,
      slug,
      name,
      subtitle: "New draft",
      status: "draft",
      primaryImage: imageUrl,
    });
    if (imageUrl) {
      await tx.insert(productImages).values({ productId: id, url: imageUrl, alt: name, position: 0 });
    }
    await tx.insert(productVariants).values(
      ["S", "M", "L", "XL", "XXL", "XXXL", "4XL"].map((size) => ({
        productId: id,
        size,
        sku: `CAS-${id.slice(0, 6).toUpperCase()}-${size}`,
        stock: 0,
      })),
    );
  });
  return Response.json({ productId: id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;

  const payload = (await request.json()) as {
    id?: string;
    name?: string;
    subtitle?: string;
    description?: string;
    price?: number;
    compareAt?: number;
    status?: "draft" | "active" | "archived";
    featured?: boolean;
    color?: string;
    fabric?: string;
    includes?: string;
    care?: string;
    packedWeightGrams?: number;
    primaryImage?: string;
    images?: string[];
    variants?: Array<{ id: number; stock: number; active?: boolean }>;
  };
  if (!payload.id) return Response.json({ error: "Product id is required" }, { status: 400 });
  if (payload.status && !allowedStatuses.has(payload.status)) return Response.json({ error: "Invalid status" }, { status: 400 });

  const pricePaise = Math.round(Number(payload.price) * 100);
  const compareAtPaise = Math.round(Number(payload.compareAt) * 100);
  const packedWeightGrams = Math.floor(Number(payload.packedWeightGrams));
  if (!Number.isFinite(pricePaise) || pricePaise < 0 || pricePaise > 10_000_000) return Response.json({ error: "Enter a valid price" }, { status: 400 });
  if (!Number.isFinite(compareAtPaise) || compareAtPaise < 0 || compareAtPaise > 10_000_000) return Response.json({ error: "Enter a valid compare-at price" }, { status: 400 });
  if (!Number.isFinite(packedWeightGrams) || packedWeightGrams < 0 || packedWeightGrams > 50_000) return Response.json({ error: "Enter a valid packed shipping weight in grams." }, { status: 400 });

  const db = getDb();
  const [existing] = await db.select({ id: products.id, primaryImage: products.primaryImage }).from(products).where(eq(products.id, payload.id)).limit(1);
  if (!existing) return Response.json({ error: "Product not found" }, { status: 404 });

  const name = payload.name?.trim().slice(0, 120) || "Untitled product";
  const baseSlug = productSlug(name) || `product-${existing.id.slice(0, 6)}`;
  const [slugConflict] = await db.select({ id: products.id }).from(products).where(and(eq(products.slug, baseSlug), ne(products.id, existing.id))).limit(1);
  const slug = slugConflict ? `${baseSlug}-${existing.id.slice(0, 6)}` : baseSlug;
  const images = payload.images ? safeImages(payload.images) : safeImages([payload.primaryImage ?? existing.primaryImage]);
  const primaryImage = images[0] ?? "";
  if (payload.status === "active" && pricePaise <= 0) return Response.json({ error: "An active product needs a price greater than zero." }, { status: 400 });
  if (payload.status === "active" && !primaryImage) return Response.json({ error: "Add at least one product image before publishing." }, { status: 400 });
  if (payload.status === "active" && packedWeightGrams <= 0) return Response.json({ error: "Add the accurate packed shipping weight before publishing this product." }, { status: 400 });

  const existingVariants = await db
    .select({ id: productVariants.id, stock: productVariants.stock, active: productVariants.active })
    .from(productVariants)
    .where(eq(productVariants.productId, payload.id));
  const existingVariantMap = new Map(existingVariants.map((variant) => [variant.id, variant]));
  const variantUpdates = (payload.variants ?? []).map((variant) => ({
    id: Number(variant.id),
    stock: Math.max(0, Math.min(9999, Math.floor(Number(variant.stock) || 0))),
    active: variant.active !== false,
  }));
  if (variantUpdates.some((variant) => !Number.isInteger(variant.id) || !existingVariantMap.has(variant.id))) {
    return Response.json({ error: "One of the product variants is invalid." }, { status: 400 });
  }

  const restockedVariantIds = variantUpdates
    .filter((variant) => {
      const before = existingVariantMap.get(variant.id)!;
      return before.stock <= 0 && variant.stock > 0 && variant.active;
    })
    .map((variant) => variant.id);

  await db.transaction(async (tx) => {
    await tx.update(products).set({
      name,
      slug,
      subtitle: payload.subtitle?.trim().slice(0, 120) || "",
      description: payload.description?.trim().slice(0, 3000) || "",
      pricePaise,
      compareAtPaise,
      status: payload.status ?? "draft",
      featured: Boolean(payload.featured),
      color: payload.color?.trim().slice(0, 80) || "",
      fabric: payload.fabric?.trim().slice(0, 160) || "",
      includes: payload.includes?.trim().slice(0, 300) || "",
      care: payload.care?.trim().slice(0, 500) || "",
      packedWeightGrams,
      primaryImage,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    }).where(eq(products.id, existing.id));

    for (const variant of variantUpdates) {
      await tx
        .update(productVariants)
        .set({ stock: variant.stock, active: variant.active })
        .where(and(eq(productVariants.id, variant.id), eq(productVariants.productId, existing.id)));
    }

    await tx.delete(productImages).where(eq(productImages.productId, existing.id));
    if (images.length) {
      const alt = payload.name?.trim().slice(0, 120) || "Product image";
      await tx.insert(productImages).values(images.map((url, position) => ({ productId: existing.id, url, alt: `${alt}, view ${position + 1}`, position })));
    }
  });
  await notifyRestock(restockedVariantIds);
  return Response.json({ ok: true, slug });
}
