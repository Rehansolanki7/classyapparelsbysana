import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { productVariants, products, restockSubscriptions } from "../../../db/schema";
import { normalizeEmail } from "../../../lib/auth";
import { checkRateLimit, clientAddress, rateLimitResponse } from "../../../lib/rate-limit";
import { rejectCrossSite } from "../../../lib/security";

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const rate = checkRateLimit(`restock:${clientAddress(request)}`, 10, 15 * 60 * 1000, 30 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);

  let payload: { email?: string; productId?: string; variantId?: number | null };
  try {
    payload = await request.json() as typeof payload;
  } catch {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const email = normalizeEmail(payload.email ?? "");
  const productId = payload.productId?.slice(0, 36) ?? "";
  const variantId = Number(payload.variantId);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !productId || !Number.isInteger(variantId) || variantId <= 0) {
    return Response.json({ error: "Choose a size and enter a valid email address." }, { status: 400 });
  }

  const db = getDb();
  const [variant] = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(productVariants.id, variantId), eq(productVariants.productId, productId), eq(products.status, "active")))
    .limit(1);
  if (!variant) return Response.json({ error: "That product size is no longer available." }, { status: 404 });

  try {
    await db.insert(restockSubscriptions).values({ id: crypto.randomUUID(), email, productId, variantId });
  } catch (error) {
    const databaseError = error as { code?: string; cause?: { code?: string } };
    if ((databaseError.code ?? databaseError.cause?.code) !== "ER_DUP_ENTRY") {
      return Response.json({ error: "We could not save this request. Please try again." }, { status: 503 });
    }
  }
  return Response.json({ ok: true });
}
