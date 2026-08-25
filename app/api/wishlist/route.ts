import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { wishlistItems } from "../../../db/schema";
import { currentUser } from "../../../lib/auth";
import { rejectCrossSite } from "../../../lib/security";

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ productIds: [] });
  const db = getDb();
  const items = await db.select({ productId: wishlistItems.productId }).from(wishlistItems).where(eq(wishlistItems.userId, user.id));
  return Response.json({ productIds: items.map((item) => item.productId) });
}

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request); if (rejected) return rejected;
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to save favourites." }, { status: 401 });
  const payload = (await request.json()) as { productId?: string };
  const productId = payload.productId?.slice(0, 36) ?? "";
  if (!productId) return Response.json({ error: "Product is required" }, { status: 400 });
  const db = getDb();
  const [existing] = await db.select({ id: wishlistItems.id }).from(wishlistItems).where(and(eq(wishlistItems.userId, user.id), eq(wishlistItems.productId, productId))).limit(1);
  if (existing) { await db.delete(wishlistItems).where(eq(wishlistItems.id, existing.id)); return Response.json({ saved: false }); }
  await db.insert(wishlistItems).values({ userId: user.id, productId });
  return Response.json({ saved: true });
}
