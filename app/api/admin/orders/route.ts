import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { orders } from "../../../../db/schema";
import { rejectUnlessAdmin } from "../../../../lib/admin-auth";
import { sendPaidOrderNotifications } from "../../../../lib/order-notifications";
import { cancelPendingOrderAndRelease, finalizeCapturedOrder, restoreOrderStockOnce } from "../../../../lib/orders";
import { recordEvent } from "../../../../lib/logging";
import { currentUser } from "../../../../lib/auth";

const allowed = new Set(["paid", "processing", "shipped", "delivered", "cancelled"]);
const transitions: Record<string, Set<string>> = {
  pending_payment: new Set(["cancelled"]),
  payment_failed: new Set(["cancelled"]),
  paid: new Set(["paid", "processing"]),
  processing: new Set(["processing", "shipped"]),
  shipped: new Set(["shipped", "delivered"]),
  delivered: new Set(["delivered"]),
  cancelled: new Set(["cancelled"]),
  refund_pending: new Set(),
  refunded: new Set(),
};

function clean(value: string | undefined | null, max: number) {
  return (value ?? "").trim().replace(/[<>]/g, "").slice(0, max);
}

export async function GET(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;
  const db = getDb();
  return Response.json({ orders: await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(100) });
}

export async function PATCH(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;
  let payload: { id?: string; status?: string; courierName?: string; trackingNumber?: string; trackingUrl?: string; legalHold?: boolean };
  try {
    payload = await request.json() as typeof payload;
  } catch {
    return Response.json({ error: "Invalid order update" }, { status: 400 });
  }
  if (!payload.id) return Response.json({ error: "Invalid order update" }, { status: 400 });

  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, payload.id)).limit(1);
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  // Legal holds are allowed on any historic order, including refunded records
  // that intentionally have no normal fulfilment transition left.
  if ((!payload.status || !allowed.has(payload.status)) && typeof payload.legalHold === "boolean") {
    await db.update(orders).set({ legalHold: payload.legalHold, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(orders.id, order.id));
    if (payload.legalHold !== order.legalHold) {
      const user = await currentUser();
      await recordEvent({ severity: "security", eventType: payload.legalHold ? "admin.order_legal_hold_enabled" : "admin.order_legal_hold_removed", actorId: user?.id, entityType: "order", entityId: order.id });
    }
    return Response.json({ ok: true });
  }
  if (!payload.status || !allowed.has(payload.status)) return Response.json({ error: "Invalid order update" }, { status: 400 });

  const courierName = clean(payload.courierName, 100);
  const trackingNumber = clean(payload.trackingNumber, 120);
  const trackingUrl = clean(payload.trackingUrl, 500);
  if (trackingUrl && !/^https:\/\//i.test(trackingUrl)) return Response.json({ error: "Tracking link must start with https://" }, { status: 400 });
  if (payload.status === "shipped" && (!courierName || !trackingNumber)) {
    return Response.json({ error: "Courier name and tracking number are required before marking an order shipped." }, { status: 400 });
  }

  if (!transitions[order.status]?.has(payload.status)) {
    return Response.json({ error: `An order cannot move from ${order.status} to ${payload.status}.` }, { status: 409 });
  }
  if (payload.status !== "cancelled" && order.paymentStatus !== "captured") {
    return Response.json({ error: "Only a captured payment can be fulfilled." }, { status: 409 });
  }
  if (payload.status === "cancelled" && order.paymentStatus === "captured") {
    return Response.json({ error: "Use the refund action for a paid order so the customer is refunded safely." }, { status: 400 });
  }
  if (payload.status === "cancelled" && order.status === "pending_payment") {
    await cancelPendingOrderAndRelease(order.id, false, true);
    return Response.json({ ok: true });
  }

  const status = payload.status as "paid" | "processing" | "shipped" | "delivered" | "cancelled";
  await db
    .update(orders)
    .set({
      status,
      courierName,
      trackingNumber,
      trackingUrl,
      legalHold: typeof payload.legalHold === "boolean" ? payload.legalHold : order.legalHold,
      shippedAt: status === "shipped" ? sql`COALESCE(${orders.shippedAt}, CURRENT_TIMESTAMP)` : undefined,
      deliveredAt: status === "delivered" ? sql`COALESCE(${orders.deliveredAt}, CURRENT_TIMESTAMP)` : undefined,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(orders.id, payload.id));
  if (typeof payload.legalHold === "boolean" && payload.legalHold !== order.legalHold) {
    const user = await currentUser();
    await recordEvent({ severity: "security", eventType: payload.legalHold ? "admin.order_legal_hold_enabled" : "admin.order_legal_hold_removed", actorId: user?.id, entityType: "order", entityId: order.id });
  }
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;
  let payload: { id?: string; action?: "resend_notification" | "reconcile_payment" | "refund"; reason?: string; restock?: boolean };
  try {
    payload = await request.json() as typeof payload;
  } catch {
    return Response.json({ error: "Invalid order action" }, { status: 400 });
  }
  if (!payload.id || !payload.action) return Response.json({ error: "Invalid order action" }, { status: 400 });
  if (payload.action === "resend_notification") {
    const sent = await sendPaidOrderNotifications(payload.id, true);
    return sent ? Response.json({ ok: true, status: "sent" }) : Response.json({ error: "Email notification could not be sent. Check the email integration settings.", status: "failed" }, { status: 503 });
  }

  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, payload.id)).limit(1);
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  if (payload.action === "reconcile_payment") {
    if (order.paymentStatus === "captured" || order.paymentStatus === "refunded") {
      return Response.json({ ok: true, status: order.status, paymentStatus: order.paymentStatus });
    }
    if (!order.razorpayOrderId) return Response.json({ error: "This order was never connected to Razorpay." }, { status: 400 });
    const keyId = process.env.RAZORPAY_KEY_ID?.trim();
    const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
    if (!keyId || !keySecret) return Response.json({ error: "Razorpay is not configured." }, { status: 503 });
    let paymentsResponse: Response;
    try {
      paymentsResponse = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(order.razorpayOrderId)}/payments`, {
        headers: { authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`, accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return Response.json({ error: "Razorpay reconciliation timed out. Try again." }, { status: 502 });
    }
    if (!paymentsResponse.ok) return Response.json({ error: "Razorpay could not return payments for this order." }, { status: 502 });
    const payments = await paymentsResponse.json() as { items?: Array<{ id?: string; order_id?: string; amount?: number; currency?: string; status?: string }> };
    const captured = payments.items?.find((payment) => payment.id && payment.order_id === order.razorpayOrderId && payment.amount === order.totalPaise && payment.currency === "INR" && payment.status === "captured");
    if (!captured?.id) return Response.json({ ok: true, status: order.status, paymentStatus: order.paymentStatus, message: "No captured payment was found." });
    const result = await finalizeCapturedOrder(order.id, captured.id);
    if (result === "captured") await sendPaidOrderNotifications(order.id);
    return Response.json({ ok: true, status: result === "refund_required" ? "refund_pending" : "paid", paymentStatus: "captured", result });
  }
  if (!order.razorpayPaymentId) {
    return Response.json({ error: "Only a captured Razorpay payment can be refunded." }, { status: 400 });
  }
  if (order.paymentStatus === "refunded" || order.status === "refunded") {
    if (payload.restock) await restoreOrderStockOnce(order.id);
    return Response.json({ ok: true, status: "refunded" });
  }
  if (order.paymentStatus !== "captured") return Response.json({ error: "Only a captured Razorpay payment can be refunded." }, { status: 400 });
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) return Response.json({ error: "Razorpay is not configured." }, { status: 503 });

  const reason = clean(order.refundReason || payload.reason, 300) || "Customer cancellation";
  await db
    .update(orders)
    .set({ status: "refund_pending", refundReason: reason, restockRequested: Boolean(payload.restock), updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(orders.id, order.id));

  let response: Response;
  try {
    response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(order.razorpayPaymentId)}/refund`, {
      method: "POST",
      headers: {
        authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
        "content-type": "application/json",
        "X-Refund-Idempotency": `classy-apparels-refund-${order.id}`,
      },
      body: JSON.stringify({ amount: order.totalPaise, notes: { reason, local_order_id: order.id } }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return Response.json({ error: "Refund status is pending confirmation. Retry this same refund action; it is protected against duplicates." }, { status: 502 });
  }
  if (!response.ok) {
    return Response.json({ error: "Razorpay could not confirm the refund. Check the payment in Razorpay, then retry the same action safely." }, { status: 502 });
  }

  const refund = await response.json() as { id?: string; status?: string };
  if (!refund.id) return Response.json({ error: "Razorpay returned an incomplete refund response." }, { status: 502 });
  const complete = refund.status === "processed";
  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({
        status: complete ? "refunded" : "refund_pending",
        paymentStatus: complete ? "refunded" : "captured",
        refundId: refund.id,
        refundReason: reason,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(orders.id, order.id));

  });
  if (payload.restock) await restoreOrderStockOnce(order.id);
  return Response.json({ ok: true, status: complete ? "refunded" : "refund_pending" });
}
