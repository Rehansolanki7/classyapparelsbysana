import { and, eq, lt, ne, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { coupons, orderItems, orders, productVariants } from "../db/schema";

export type CaptureResult = "captured" | "already_captured" | "refund_required" | "ignored" | "missing";

class InventoryConflict extends Error {}

function affected(result: unknown) {
  return Number((result as Array<{ affectedRows?: number }>)[0]?.affectedRows ?? 0);
}

export async function finalizeCapturedOrder(orderId: string, paymentId: string, paymentSignature = ""): Promise<CaptureResult> {
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order) return "missing";
      if (order.paymentStatus === "captured") {
        if (paymentSignature && !order.razorpaySignature) {
          await tx.update(orders).set({ razorpaySignature: paymentSignature, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(orders.id, orderId));
        }
        return "already_captured";
      }
      if (order.paymentStatus === "refunded" || order.status === "refunded") return "ignored";

      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      if (!items.length) throw new InventoryConflict("Paid order has no line items");

      const claimed = await tx
        .update(orders)
        .set({
          paymentStatus: "captured",
          status: "paid",
          razorpayPaymentId: paymentId,
          razorpaySignature: paymentSignature || undefined,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(and(eq(orders.id, orderId), ne(orders.paymentStatus, "captured"), ne(orders.paymentStatus, "refunded")));
      if (!affected(claimed)) return "already_captured";

      const hasActiveReservation = order.status === "pending_payment";
      for (const item of items) {
        const inventory = hasActiveReservation
          ? await tx
              .update(productVariants)
              .set({
                stock: sql`${productVariants.stock} - ${item.quantity}`,
                reservedStock: sql`${productVariants.reservedStock} - ${item.quantity}`,
              })
              .where(and(
                eq(productVariants.id, item.variantId),
                sql`${productVariants.stock} >= ${item.quantity}`,
                sql`${productVariants.reservedStock} >= ${item.quantity}`,
              ))
          : await tx
              .update(productVariants)
              .set({ stock: sql`${productVariants.stock} - ${item.quantity}` })
              .where(and(
                eq(productVariants.id, item.variantId),
                sql`${productVariants.stock} - ${productVariants.reservedStock} >= ${item.quantity}`,
              ));
        if (!affected(inventory)) throw new InventoryConflict(`Insufficient inventory for variant ${item.variantId}`);
      }

      if (order.couponCode) {
        await tx
          .update(coupons)
          .set({ usageCount: sql`${coupons.usageCount} + 1`, updatedAt: sql`CURRENT_TIMESTAMP` })
          .where(eq(coupons.code, order.couponCode));
      }
      return "captured";
    });
  } catch (error) {
    if (!(error instanceof InventoryConflict)) throw error;

    // The payment exists at Razorpay but inventory could not be fulfilled. Record it
    // durably so an administrator can issue an idempotent refund instead of losing it.
    const marked = await db
      .update(orders)
      .set({
        paymentStatus: "captured",
        status: "refund_pending",
        razorpayPaymentId: paymentId,
        razorpaySignature: paymentSignature || undefined,
        refundReason: "Automatic refund required: inventory unavailable at payment capture",
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(and(eq(orders.id, orderId), ne(orders.paymentStatus, "captured"), ne(orders.paymentStatus, "refunded")));
    if (affected(marked)) return "refund_required";
    const [current] = await db.select({ paymentStatus: orders.paymentStatus }).from(orders).where(eq(orders.id, orderId)).limit(1);
    return current?.paymentStatus === "captured" ? "already_captured" : "ignored";
  }
}

export async function markPaymentAttemptFailed(orderId: string, paymentId = "") {
  const db = getDb();
  const updated = await db
    .update(orders)
    .set({
      paymentStatus: "failed",
      razorpayPaymentId: paymentId || undefined,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending_payment"), ne(orders.paymentStatus, "captured")));
  return affected(updated) > 0;
}

export async function cancelPendingOrderAndRelease(orderId: string, failed = false) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(orders)
      .set({
        status: failed ? "payment_failed" : "cancelled",
        paymentStatus: failed ? "failed" : undefined,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(and(eq(orders.id, orderId), eq(orders.status, "pending_payment"), ne(orders.paymentStatus, "captured")));
    if (!affected(claimed)) return false;
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    for (const item of items) {
      await tx
        .update(productVariants)
        .set({ reservedStock: sql`GREATEST(0, ${productVariants.reservedStock} - ${item.quantity})` })
        .where(eq(productVariants.id, item.variantId));
    }
    return true;
  });
}

export async function releaseExpiredReservations(limit = 30) {
  const db = getDb();
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const expired = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(
      eq(orders.status, "pending_payment"),
      or(eq(orders.paymentStatus, "pending"), eq(orders.paymentStatus, "failed"), eq(orders.paymentStatus, "verified")),
      lt(orders.expiresAt, now),
    ))
    .limit(limit);
  let released = 0;
  for (const order of expired) if (await cancelPendingOrderAndRelease(order.id)) released += 1;
  return released;
}
