import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { addresses, orderItems, orders, privacyRequests, restockSubscriptions, users, wishlistItems } from "../../../../db/schema";
import { currentUser, deleteSessionCookie, requestEmailCode, verifyEmailCode } from "../../../../lib/auth";
import { sendPrivacyDeletionEmail } from "../../../../lib/email";
import { errorCode, recordEvent } from "../../../../lib/logging";
import { rejectCrossSite } from "../../../../lib/security";

const dbTime = (date = new Date()) => date.toISOString().slice(0, 19).replace("T", " ");
const emailHash = (email: string) => createHash("sha256").update(email).digest("hex");

async function signedInCustomer() {
  const user = await currentUser();
  return user?.adminAuthenticated ? null : user;
}

export async function GET() {
  const user = await signedInCustomer();
  if (!user) return Response.json({ error: "Sign in to export your account data." }, { status: 401 });
  try {
    const db = getDb();
    const [profileRows, savedAddresses, savedWishlist, restock, orderRows] = await Promise.all([
      db.select({ id: users.id, email: users.email, name: users.name, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt }).from(users).where(eq(users.id, user.id)).limit(1),
      db.select().from(addresses).where(eq(addresses.userId, user.id)).orderBy(desc(addresses.createdAt)),
      db.select({ productId: wishlistItems.productId, createdAt: wishlistItems.createdAt }).from(wishlistItems).where(eq(wishlistItems.userId, user.id)),
      db.select({ productId: restockSubscriptions.productId, variantId: restockSubscriptions.variantId, createdAt: restockSubscriptions.createdAt, notifiedAt: restockSubscriptions.notifiedAt }).from(restockSubscriptions).where(eq(restockSubscriptions.email, user.email)),
      db.select().from(orders).where(eq(orders.email, user.email)).orderBy(desc(orders.createdAt)),
    ]);
    const orderHistory = await Promise.all(orderRows.map(async (order) => ({
      ...order,
      razorpaySignature: undefined,
      items: await db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
    })));
    await recordEvent({ severity: "info", eventType: "privacy.data_export_created", actorId: user.id });
    const response = NextResponse.json({ exportedAt: new Date().toISOString(), profile: profileRows[0] ?? null, addresses: savedAddresses, wishlist: savedWishlist, restockRequests: restock, orders: orderHistory });
    response.headers.set("content-disposition", 'attachment; filename="classy-apparels-account-data.json"');
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) {
    await recordEvent({ severity: "error", eventType: "privacy.data_export_failed", actorId: user.id, detail: errorCode(error) });
    return Response.json({ error: "We could not create your data export. Please try again." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const user = await signedInCustomer();
  if (!user) return Response.json({ error: "Sign in to manage your privacy choices." }, { status: 401 });
  let payload: { action?: string; code?: string };
  try { payload = await request.json() as typeof payload; } catch { return Response.json({ error: "Invalid privacy request." }, { status: 400 }); }

  if (payload.action === "send_deletion_code") {
    try {
      await requestEmailCode(user.email, "privacy_delete");
      await recordEvent({ severity: "security", eventType: "privacy.deletion_code_sent", actorId: user.id });
      return Response.json({ ok: true });
    } catch (error) {
      await recordEvent({ severity: "security", eventType: "privacy.deletion_code_failed", actorId: user.id, detail: errorCode(error) });
      return Response.json({ error: error instanceof Error ? error.message : "We could not send a verification code." }, { status: 400 });
    }
  }

  if (payload.action !== "request_deletion") return Response.json({ error: "Choose a valid privacy action." }, { status: 400 });
  try {
    const verified = await verifyEmailCode(user.email, payload.code ?? "", "privacy_delete");
    if (verified.id !== user.id) return Response.json({ error: "Verify the email address for this signed-in account." }, { status: 403 });
    const db = getDb();
    const requestId = crypto.randomUUID();
    const now = dbTime();
    await db.transaction(async (tx) => {
      await tx.insert(privacyRequests).values({ id: requestId, requesterUserId: user.id, email: user.email, emailHash: emailHash(user.email), status: "pending", verifiedAt: now });
      // Explicit deletes make the data-removal scope auditable; the foreign-key
      // cascade on users is a defensive second layer for addresses and wishlist.
      await tx.delete(addresses).where(eq(addresses.userId, user.id));
      await tx.delete(wishlistItems).where(eq(wishlistItems.userId, user.id));
      await tx.delete(restockSubscriptions).where(eq(restockSubscriptions.email, user.email));
      await tx.delete(users).where(and(eq(users.id, user.id), eq(users.email, user.email)));
      await tx.update(privacyRequests).set({ status: "completed", completedAt: now, updatedAt: now }).where(eq(privacyRequests.id, requestId));
    });
    await recordEvent({ severity: "security", eventType: "privacy.deletion_completed", actorId: user.id, entityType: "privacy_request", entityId: requestId });
    try { await sendPrivacyDeletionEmail(user.email); } catch (error) { await recordEvent({ severity: "warning", eventType: "privacy.deletion_email_failed", entityType: "privacy_request", entityId: requestId, detail: errorCode(error) }); }
    const response = NextResponse.json({ ok: true, message: "Your account profile, saved addresses, wishlist and restock requests have been removed. Historic paid-order records remain only for legal and accounting obligations." });
    const cookie = deleteSessionCookie();
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    await recordEvent({ severity: "error", eventType: "privacy.deletion_failed", actorId: user.id, detail: errorCode(error) });
    return Response.json({ error: error instanceof Error ? error.message : "We could not complete the deletion request. Please try again." }, { status: 400 });
  }
}
