import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { orders } from "../db/schema";
import { errorCode, recordEvent } from "./logging";

type RefundAttempt = "processed" | "pending" | "not_eligible" | "failed";

function basicAuthorization(keyId: string, keySecret: string) {
  return `Basic ${btoa(`${keyId}:${keySecret}`)}`;
}

/**
 * Requests one full Razorpay refund for a locally captured order. The stable
 * idempotency key and request body make webhook retries and an admin retry
 * safe. Inventory-conflict refunds do not restock because their transaction
 * rolls the attempted stock deduction back before reaching this function.
 */
export async function requestFullRefund(orderId: string, fallbackReason = "Customer cancellation"): Promise<RefundAttempt> {
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || !order.razorpayPaymentId || order.paymentStatus === "refunded" || order.status === "refunded") return "not_eligible";
  if (order.paymentStatus !== "captured") return "not_eligible";

  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) return "failed";

  const reason = (order.refundReason || fallbackReason).trim().slice(0, 300) || "Customer cancellation";
  await db
    .update(orders)
    .set({ status: "refund_pending", refundReason: reason, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(orders.id, order.id));

  let response: Response;
  try {
    response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(order.razorpayPaymentId)}/refund`, {
      method: "POST",
      headers: {
        authorization: basicAuthorization(keyId, keySecret),
        "content-type": "application/json",
        "X-Refund-Idempotency": `classy-apparels-refund-${order.id}`,
      },
      body: JSON.stringify({ amount: order.totalPaise, notes: { reason, local_order_id: order.id } }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return "failed";
  }
  if (!response.ok) return "failed";

  const refund = await response.json() as { id?: string; status?: string };
  if (!refund.id) return "failed";
  const processed = refund.status === "processed";
  await db
    .update(orders)
    .set({
      status: processed ? "refunded" : "refund_pending",
      paymentStatus: processed ? "refunded" : "captured",
      refundId: refund.id,
      refundReason: reason,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(orders.id, order.id));
  return processed ? "processed" : "pending";
}

/** Best-effort post-response action; any failure remains visibly refundable in Admin. */
export async function attemptAutomaticRefund(orderId: string) {
  try {
    const outcome = await requestFullRefund(orderId, "Automatic refund required: order could not be fulfilled after payment capture");
    await recordEvent({
      severity: outcome === "failed" ? "error" : "warning",
      eventType: outcome === "failed" ? "checkout.automatic_refund_failed" : "checkout.automatic_refund_requested",
      entityType: "order",
      entityId: orderId,
      detail: outcome,
    });
    return outcome;
  } catch (error) {
    await recordEvent({ severity: "error", eventType: "checkout.automatic_refund_failed", entityType: "order", entityId: orderId, detail: errorCode(error) });
    return "failed" as const;
  }
}
