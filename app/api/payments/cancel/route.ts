import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { orders } from "../../../../db/schema";
import { currentUser } from "../../../../lib/auth";
import { recordEvent } from "../../../../lib/logging";
import { cancelPendingOrderAndRelease } from "../../../../lib/orders";
import { rejectCrossSite } from "../../../../lib/security";

/**
 * Releases a checkout reservation only when the customer explicitly closes
 * Razorpay before a successful callback. Razorpay retries use the same order,
 * so failed-attempt webhooks deliberately do not call this route.
 */
export async function POST(request: Request) {
  const crossSite = rejectCrossSite(request);
  if (crossSite) return crossSite;
  const user = await currentUser();
  if (!user || user.adminAuthenticated) return Response.json({ error: "Sign in to cancel this checkout." }, { status: 401 });

  let payload: { localOrderId?: string };
  try {
    payload = await request.json() as typeof payload;
  } catch {
    return Response.json({ error: "Invalid checkout cancellation." }, { status: 400 });
  }
  const orderId = payload.localOrderId?.trim().slice(0, 36) ?? "";
  if (!orderId) return Response.json({ error: "Invalid checkout cancellation." }, { status: 400 });

  const [order] = await getDb().select({ id: orders.id, email: orders.email }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return Response.json({ ok: true });
  if (order.email !== user.email) return Response.json({ error: "This checkout does not belong to this account." }, { status: 403 });

  const released = await cancelPendingOrderAndRelease(order.id);
  if (released) await recordEvent({ severity: "info", eventType: "checkout.reservation_released_by_customer", actorId: user.id, entityType: "order", entityId: order.id });
  return Response.json({ ok: true, released });
}
