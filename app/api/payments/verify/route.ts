import { and, eq, ne, sql } from "drizzle-orm";
import { after } from "next/server";
import { getDb } from "../../../../db";
import { orders } from "../../../../db/schema";
import { finalizeCapturedOrder } from "../../../../lib/orders";
import { sendPaidOrderNotifications } from "../../../../lib/order-notifications";
import { constantTimeEqual, hmacSha256Hex, rejectCrossSite } from "../../../../lib/security";
import { recordEvent } from "../../../../lib/logging";
import { currentUser } from "../../../../lib/auth";
import { attemptAutomaticRefund } from "../../../../lib/refunds";

export async function POST(request: Request) {
  const crossSite = rejectCrossSite(request);
  if (crossSite) return crossSite;
  const user = await currentUser();
  if (!user || user.adminAuthenticated) return Response.json({ error: "Sign in to confirm this payment." }, { status: 401 });
  const keys = process.env;
  if (!keys.RAZORPAY_KEY_ID || !keys.RAZORPAY_KEY_SECRET) return Response.json({ error: "Payments are not configured" }, { status: 503 });
  let payload: {
    localOrderId?: string;
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  };
  try {
    payload = await request.json() as typeof payload;
  } catch {
    return Response.json({ error: "Invalid payment response" }, { status: 400 });
  }
  if (!payload.localOrderId || !payload.razorpay_payment_id || !payload.razorpay_signature) return Response.json({ error: "Incomplete payment response" }, { status: 400 });
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, payload.localOrderId)).limit(1);
  if (!order?.razorpayOrderId || order.razorpayOrderId !== payload.razorpay_order_id) return Response.json({ error: "Payment does not match this order" }, { status: 400 });
  if (order.email !== user.email) return Response.json({ error: "Payment does not belong to this account." }, { status: 403 });

  const expected = await hmacSha256Hex(keys.RAZORPAY_KEY_SECRET, `${order.razorpayOrderId}|${payload.razorpay_payment_id}`);
  if (!constantTimeEqual(expected, payload.razorpay_signature)) {
    await recordEvent({ severity: "security", eventType: "checkout.payment_signature_failed", entityType: "order", entityId: order.id });
    return Response.json({ error: "Payment verification failed" }, { status: 400 });
  }

  let paymentResponse: Response;
  try {
    paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(payload.razorpay_payment_id)}`, {
      headers: { authorization: `Basic ${btoa(`${keys.RAZORPAY_KEY_ID}:${keys.RAZORPAY_KEY_SECRET}`)}`, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return Response.json({ error: "Payment confirmation is pending" }, { status: 202 });
  }
  if (!paymentResponse.ok) return Response.json({ error: "Payment confirmation is pending" }, { status: 202 });
  const payment = (await paymentResponse.json()) as { id: string; order_id: string; amount: number; currency: string; status: string };
  if (payment.order_id !== order.razorpayOrderId || payment.amount !== order.totalPaise || payment.currency !== "INR") return Response.json({ error: "Payment details do not match the order" }, { status: 400 });

  if (payment.status === "captured") {
    if (order.status === "refund_pending") {
      return Response.json({ ok: true, captured: true, refundPending: true, orderNumber: order.orderNumber, message: "Your payment is already being refunded. Do not place another order for this payment." });
    }
    if (order.status === "refunded" || order.paymentStatus === "refunded") {
      return Response.json({ error: "This payment has already been refunded." }, { status: 409 });
    }
    const result = await finalizeCapturedOrder(order.id, payment.id, payload.razorpay_signature);
    if (result === "captured") after(() => sendPaidOrderNotifications(order.id));
    if (result === "refund_required") {
      await recordEvent({ severity: "warning", eventType: "checkout.payment_captured_refund_required", entityType: "order", entityId: order.id });
      after(() => attemptAutomaticRefund(order.id));
      return Response.json({
        ok: true,
        captured: true,
        refundPending: true,
        orderNumber: order.orderNumber,
        message: "Your payment was received, but the item became unavailable. Your full refund is now being started automatically.",
      });
    }
    if (result === "ignored" || result === "missing") {
      await recordEvent({ severity: "warning", eventType: "checkout.captured_payment_not_fulfillable", entityType: "order", entityId: order.id });
      return Response.json({ error: "This payment cannot be fulfilled. Please contact Sana for help." }, { status: 409 });
    }
    await recordEvent({ severity: "info", eventType: "checkout.payment_captured", entityType: "order", entityId: order.id });
    return Response.json({ ok: true, captured: true, orderNumber: order.orderNumber });
  }
  await db
    .update(orders)
    .set({ paymentStatus: "verified", razorpayPaymentId: payment.id, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(and(eq(orders.id, order.id), ne(orders.paymentStatus, "captured")));
  return Response.json({ ok: true, captured: false, orderNumber: order.orderNumber }, { status: 202 });
}
