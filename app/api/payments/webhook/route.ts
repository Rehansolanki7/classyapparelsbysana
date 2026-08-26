import { eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { getDb } from "../../../../db";
import { orders } from "../../../../db/schema";
import { finalizeCapturedOrder, markPaymentAttemptFailed, restoreOrderStockOnce } from "../../../../lib/orders";
import { sendPaidOrderNotifications } from "../../../../lib/order-notifications";
import { constantTimeEqual, hmacSha256Hex } from "../../../../lib/security";
import { attemptAutomaticRefund } from "../../../../lib/refunds";

export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 503 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 256 * 1024) return new Response("Payload too large", { status: 413 });
  const body = await request.text();
  if (body.length > 256 * 1024) return new Response("Payload too large", { status: 413 });
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const expected = await hmacSha256Hex(secret, body);
  if (!constantTimeEqual(expected, signature)) return new Response("Invalid signature", { status: 401 });

  let event: {
    event?: string;
    payload?: {
      payment?: { entity?: { id?: string; order_id?: string; status?: string; amount?: number; currency?: string } };
      refund?: { entity?: { id?: string; payment_id?: string; status?: string } };
    };
  };
  try {
    event = JSON.parse(body) as typeof event;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const refund = event.payload?.refund?.entity;
  if (refund?.payment_id && refund.id && event.event === "refund.processed") {
    const db = getDb();
    const [order] = await db.select({ id: orders.id, restockRequested: orders.restockRequested }).from(orders).where(eq(orders.razorpayPaymentId, refund.payment_id)).limit(1);
    if (!order) return Response.json({ ok: true });
    await db
      .update(orders)
      .set({
        status: "refunded",
        paymentStatus: "refunded",
        refundId: refund.id,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(orders.id, order.id));
    if (order.restockRequested) await restoreOrderStockOnce(order.id);
    return Response.json({ ok: true });
  }

  const payment = event.payload?.payment?.entity;
  if (!payment?.order_id || !payment.id) return Response.json({ ok: true });
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.razorpayOrderId, payment.order_id)).limit(1);
  if (!order) return Response.json({ ok: true });

  // The signed webhook is the fulfilment source of truth. Still bind its
  // amount/currency to our immutable local order before changing inventory.
  if ((event.event === "payment.captured" || event.event === "order.paid") && payment.status === "captured") {
    if (payment.amount !== order.totalPaise || payment.currency !== "INR") return Response.json({ ok: true });
    const result = await finalizeCapturedOrder(order.id, payment.id);
    if (result === "captured") after(() => sendPaidOrderNotifications(order.id));
    if (result === "refund_required" || (result === "already_captured" && order.status === "refund_pending")) after(() => attemptAutomaticRefund(order.id));
  }
  if (event.event === "payment.failed" && payment.status === "failed") await markPaymentAttemptFailed(order.id, payment.id);
  return Response.json({ ok: true });
}
