import { and, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { coupons, orderItems, orders, productVariants } from "../db/schema";

export type CaptureResult = "captured" | "already_captured" | "refund_required" | "ignored" | "missing";

class InventoryConflict extends Error {}
class CouponConflict extends Error {}
class CancelledCheckoutConflict extends Error {}

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
      // Razorpay can very rarely report an authorization after the browser
      // session was dismissed. A cancelled checkout must never become a
      // fulfilment order; retain the minimal payment link long enough to issue
      // an automatic refund instead.
      if (order.status === "cancelled") {
        throw new CancelledCheckoutConflict("Automatic refund required: payment was captured after checkout was cancelled");
      }

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
        .where(and(
          eq(orders.id, orderId),
          or(eq(orders.status, "pending_payment"), eq(orders.status, "payment_failed")),
          ne(orders.paymentStatus, "captured"),
          ne(orders.paymentStatus, "refunded"),
        ));
      if (!affected(claimed)) {
        const [current] = await tx.select({ status: orders.status, paymentStatus: orders.paymentStatus }).from(orders).where(eq(orders.id, orderId)).limit(1);
        if (current?.status === "cancelled") {
          throw new CancelledCheckoutConflict("Automatic refund required: payment was captured after checkout was cancelled");
        }
        return current?.paymentStatus === "captured" ? "already_captured" : "ignored";
      }

      const hasActiveReservation = order.status === "pending_payment" || order.status === "payment_failed";
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
        const couponClaim = await tx
          .update(coupons)
          .set({ usageCount: sql`${coupons.usageCount} + 1`, updatedAt: sql`CURRENT_TIMESTAMP` })
          .where(and(
            eq(coupons.code, order.couponCode),
            eq(coupons.active, true),
            or(isNull(coupons.usageLimit), gt(coupons.usageLimit, coupons.usageCount)),
          ));
        // Coupon availability can change while a customer is at Razorpay. Do
        // not fulfil a captured order at a discount that has already reached
        // its limit; the entire transaction is rolled back and refunded below.
        if (!affected(couponClaim)) throw new CouponConflict("Automatic refund required: coupon was no longer available at payment capture");
      }
      return "captured";
    });
  } catch (error) {
    if (!(error instanceof InventoryConflict) && !(error instanceof CouponConflict) && !(error instanceof CancelledCheckoutConflict)) throw error;

    // The payment exists at Razorpay but inventory could not be fulfilled. Record it
    // durably so an administrator can issue an idempotent refund instead of losing it.
    const marked = await db.transaction(async (tx) => {
      const [currentOrder] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).limit(1);
      const claim = await tx
        .update(orders)
        .set({
          paymentStatus: "captured",
          status: "refund_pending",
          razorpayPaymentId: paymentId,
          razorpaySignature: paymentSignature || undefined,
          refundReason: error.message || "Automatic refund required: inventory unavailable at payment capture",
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(and(eq(orders.id, orderId), ne(orders.paymentStatus, "captured"), ne(orders.paymentStatus, "refunded")));
      if (!affected(claim)) return false;

      // The inventory transaction above rolled back, including conversion of
      // this order's reservation into stock. Release that reservation now: a
      // captured order waiting for a refund must never make a size look sold
      // out forever.
      if (currentOrder?.status === "pending_payment") {
        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
        for (const item of items) {
          await tx
            .update(productVariants)
            .set({ reservedStock: sql`GREATEST(0, ${productVariants.reservedStock} - ${item.quantity})` })
            .where(eq(productVariants.id, item.variantId));
        }
      }
      return true;
    });
    if (marked) return "refund_required";
    const [current] = await db.select({ paymentStatus: orders.paymentStatus }).from(orders).where(eq(orders.id, orderId)).limit(1);
    return current?.paymentStatus === "captured" ? "already_captured" : "ignored";
  }
}

export async function markPaymentAttemptFailed(orderId: string, paymentId = "") {
  const db = getDb();
  const updated = await db
    .update(orders)
    .set({
      status: "payment_failed",
      paymentStatus: "failed",
      razorpayPaymentId: paymentId || undefined,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(and(
      eq(orders.id, orderId),
      or(eq(orders.status, "pending_payment"), eq(orders.status, "payment_failed")),
      ne(orders.paymentStatus, "captured"),
    ));
  return affected(updated) > 0;
}

/**
 * Removes an unpaid checkout from customer-facing data. We retain only its
 * Razorpay/local IDs and amount for a short reconciliation period, because a
 * bank can complete an authorization after the customer closes Checkout.
 */
export async function cancelPendingOrderAndRelease(orderId: string, failed = false, redactCustomerData = false) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(orders)
      .set({
        status: failed ? "payment_failed" : "cancelled",
        paymentStatus: failed ? "failed" : undefined,
        customerName: redactCustomerData ? "Cancelled checkout" : undefined,
        email: redactCustomerData ? `cancelled-${orderId}@invalid.local` : undefined,
        phone: redactCustomerData ? "" : undefined,
        addressLine1: redactCustomerData ? "" : undefined,
        addressLine2: redactCustomerData ? "" : undefined,
        city: redactCustomerData ? "" : undefined,
        state: redactCustomerData ? "" : undefined,
        countryCode: redactCustomerData ? "IN" : undefined,
        postalCode: redactCustomerData ? "" : undefined,
        formattedAddress: redactCustomerData ? "" : undefined,
        deliveryPlaceId: redactCustomerData ? "" : undefined,
        deliveryLatitude: redactCustomerData ? null : undefined,
        deliveryLongitude: redactCustomerData ? null : undefined,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(and(
        eq(orders.id, orderId),
        or(eq(orders.status, "pending_payment"), eq(orders.status, "payment_failed")),
        ne(orders.paymentStatus, "captured"),
      ));
    if (!affected(claimed)) return false;
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    for (const item of items) {
      await tx
        .update(productVariants)
        .set({ reservedStock: sql`GREATEST(0, ${productVariants.reservedStock} - ${item.quantity})` })
        .where(eq(productVariants.id, item.variantId));
    }
    // The payment/reconciliation stub deliberately has no cart contents or
    // customer/address data. It is not an order and can never enter history.
    if (redactCustomerData) await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));
    return true;
  });
}

/** Returns sold units once, after a refund that was explicitly approved for restock. */
export async function restoreOrderStockOnce(orderId: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(orders)
      .set({ stockRestoredAt: sql`CURRENT_TIMESTAMP`, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(and(eq(orders.id, orderId), isNull(orders.stockRestoredAt)));
    if (!affected(claimed)) return false;
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    for (const item of items) {
      await tx
        .update(productVariants)
        .set({ stock: sql`${productVariants.stock} + ${item.quantity}` })
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
      or(eq(orders.status, "pending_payment"), eq(orders.status, "payment_failed")),
      or(eq(orders.paymentStatus, "pending"), eq(orders.paymentStatus, "failed"), eq(orders.paymentStatus, "verified")),
      lt(orders.expiresAt, now),
    ))
    .limit(limit);
  let released = 0;
  for (const order of expired) if (await cancelPendingOrderAndRelease(order.id, false, true)) released += 1;
  return released;
}
