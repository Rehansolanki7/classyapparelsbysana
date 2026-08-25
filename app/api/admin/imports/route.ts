import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { instagramImports, productImages, products, productVariants } from "../../../../db/schema";
import { rejectUnlessAdmin } from "../../../../lib/admin-auth";
import { uploadUrl } from "../../../../lib/uploads";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export async function GET(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;
  const db = getDb();
  const imports = await db.select().from(instagramImports).orderBy(asc(instagramImports.createdAt));
  return Response.json({
    imports: imports.map((item) => ({ ...item, imageUrl: item.imageKey ? uploadUrl(item.imageKey) : item.sourceUrl })),
  });
}

export async function POST(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;
  const payload = (await request.json()) as { id?: number; action?: "create_draft" | "ignore" };
  if (!payload.id || !payload.action) return Response.json({ error: "Import and action are required" }, { status: 400 });
  const db = getDb();
  const [item] = await db.select().from(instagramImports).where(eq(instagramImports.id, payload.id)).limit(1);
  if (!item) return Response.json({ error: "Instagram item not found" }, { status: 404 });
  if (item.status !== "pending") return Response.json({ error: "This item has already been reviewed" }, { status: 409 });

  if (payload.action === "ignore") {
    await db.update(instagramImports).set({ status: "ignored" }).where(eq(instagramImports.id, item.id));
    return Response.json({ ok: true });
  }

  const firstLine = item.caption.split("\n").find((line) => line.trim())?.trim().slice(0, 100) || "Instagram product";
  const productId = crypto.randomUUID();
  const slug = `${slugify(firstLine) || "instagram-product"}-${item.instagramMediaId.slice(-6).toLowerCase()}`;
  const imageUrl = item.imageKey ? uploadUrl(item.imageKey) : item.sourceUrl;
  await db.transaction(async (tx) => {
    await tx.insert(products).values({
      id: productId,
      slug,
      name: firstLine,
      subtitle: "Imported from Instagram",
      description: item.caption,
      pricePaise: 0,
      status: "draft",
      primaryImage: imageUrl,
      source: "instagram",
      instagramMediaId: item.instagramMediaId,
      instagramPermalink: item.permalink,
    });
    await tx.insert(productImages).values({ productId, url: imageUrl, alt: firstLine, position: 0 });
    await tx.insert(productVariants).values(["S", "M", "L", "XL", "XXL", "XXXL", "4XL"].map((size) => ({ productId, size, sku: `CAS-${productId.slice(0, 6).toUpperCase()}-${size}`, stock: 0 })));
    await tx.update(instagramImports).set({ status: "imported", importedProductId: productId }).where(eq(instagramImports.id, item.id));
  });
  return Response.json({ productId }, { status: 201 });
}
