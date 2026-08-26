import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { categories, products } from "../../../../db/schema";
import { categorySlug } from "../../../../lib/categories";
import { rejectUnlessAdmin } from "../../../../lib/admin-auth";

type CategoryPayload = {
  id?: string;
  name?: string;
  active?: boolean;
  action?: "reorder";
  orderedIds?: string[];
};

function cleanName(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, 80);
}

function comparableName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function isDuplicate(error: unknown) {
  return (error as { code?: string }).code === "ER_DUP_ENTRY";
}

async function orderedCategories() {
  return getDb().select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
}

async function availableSlug(name: string, excludeId?: string) {
  const db = getDb();
  const base = categorySlug(name);
  let candidate = base;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const [match] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, candidate)).limit(1);
    if (!match || match.id === excludeId) return candidate;
    candidate = `${base.slice(0, 72)}-${attempt + 2}`;
  }
  return `${base.slice(0, 66)}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function GET(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;
  return Response.json({ categories: await orderedCategories() });
}

export async function POST(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;

  let payload: CategoryPayload;
  try {
    payload = await request.json() as CategoryPayload;
  } catch {
    return Response.json({ error: "Enter a category name." }, { status: 400 });
  }
  const name = cleanName(payload.name);
  if (name.length < 2) return Response.json({ error: "Use a category name with at least 2 characters." }, { status: 400 });

  const db = getDb();
  const existing = await orderedCategories();
  if (existing.some((category) => comparableName(category.name) === comparableName(name))) {
    return Response.json({ error: "That category already exists." }, { status: 409 });
  }
  const id = crypto.randomUUID();
  try {
    await db.insert(categories).values({ id, name, slug: await availableSlug(name), sortOrder: existing.length, active: true });
  } catch (error) {
    if (isDuplicate(error)) return Response.json({ error: "That category already exists." }, { status: 409 });
    throw error;
  }
  const [category] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  return Response.json({ category }, { status: 201 });
}

export async function PATCH(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;

  let payload: CategoryPayload;
  try {
    payload = await request.json() as CategoryPayload;
  } catch {
    return Response.json({ error: "Invalid category details." }, { status: 400 });
  }

  const db = getDb();
  if (payload.action === "reorder") {
    const orderedIds = payload.orderedIds;
    if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string")) {
      return Response.json({ error: "Invalid category order." }, { status: 400 });
    }
    const existing = await orderedCategories();
    if (new Set(orderedIds).size !== existing.length || orderedIds.length !== existing.length || existing.some((category) => !orderedIds.includes(category.id))) {
      return Response.json({ error: "Refresh categories before changing their order." }, { status: 409 });
    }
    await db.transaction(async (tx) => {
      for (const [sortOrder, id] of orderedIds.entries()) {
        await tx.update(categories).set({ sortOrder, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(categories.id, id));
      }
    });
    return Response.json({ categories: await orderedCategories() });
  }

  if (!payload.id) return Response.json({ error: "Category id is required." }, { status: 400 });
  const [existing] = await db.select().from(categories).where(eq(categories.id, payload.id)).limit(1);
  if (!existing) return Response.json({ error: "Category not found." }, { status: 404 });

  const name = payload.name === undefined ? existing.name : cleanName(payload.name);
  if (name.length < 2) return Response.json({ error: "Use a category name with at least 2 characters." }, { status: 400 });
  const nameConflict = (await orderedCategories()).some((category) => category.id !== existing.id && comparableName(category.name) === comparableName(name));
  if (nameConflict) return Response.json({ error: "That category already exists." }, { status: 409 });
  const active = payload.active === undefined ? existing.active : payload.active;
  if (!active) {
    const [liveProduct] = await db.select({ id: products.id }).from(products).where(and(eq(products.categoryId, existing.id), eq(products.status, "active"))).limit(1);
    if (liveProduct) return Response.json({ error: "Move products to another category before archiving this one." }, { status: 409 });
  }

  try {
    await db.update(categories).set({ name, slug: await availableSlug(name, existing.id), active, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(categories.id, existing.id));
  } catch (error) {
    if (isDuplicate(error)) return Response.json({ error: "That category already exists." }, { status: 409 });
    throw error;
  }
  const [category] = await db.select().from(categories).where(eq(categories.id, existing.id)).limit(1);
  return Response.json({ category });
}
