import { asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { categories } from "../db/schema";

export type ManagedCategory = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  active: boolean;
};

export const FALLBACK_CATEGORY: ManagedCategory = {
  id: "category-3-piece-sets",
  name: "3-piece sets",
  slug: "3-piece-sets",
  sortOrder: 0,
  active: true,
};

export function categorySlug(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "category";
}

export async function getManagedCategories(includeArchived = false): Promise<ManagedCategory[]> {
  try {
    const db = getDb();
    const query = db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
    const rows = includeArchived ? await query : await query.where(eq(categories.active, true));
    return rows;
  } catch {
    return includeArchived || FALLBACK_CATEGORY.active ? [FALLBACK_CATEGORY] : [];
  }
}
