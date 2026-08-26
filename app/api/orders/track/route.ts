import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { orderItems, orders } from "../../../../db/schema";
import { rejectCrossSite } from "../../../../lib/security";
import { checkRateLimit, clientAddress, rateLimitResponse } from "../../../../lib/rate-limit";

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function POST(request: Request) {
  const crossSite = rejectCrossSite(request);
  if (crossSite) return crossSite;
  const rate = checkRateLimit(`track:${clientAddress(request)}`, 20, 15 * 60 * 1000, 30 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);

  let payload: { orderNumber?: string; email?: string };
  try {
    payload = (await request.json()) as { orderNumber?: string; email?: string };
  } catch {
    return noStore({ error: "Enter your order number and email address" }, { status: 400 });
  }

  const orderNumber = (payload.orderNumber ?? "").trim().toUpperCase().slice(0, 32);
  const email = (payload.email ?? "").trim().toLowerCase().slice(0, 180);
  if (!/^CAS\d{10,16}$/.test(orderNumber) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return noStore({ error: "Enter the order number and email used at checkout" }, { status: 400 });
  }

  const db = getDb();
  const [order] = await db.select().from(orders).where(and(eq(orders.orderNumber, orderNumber), eq(orders.email, email))).limit(1);
  if (!order) return noStore({ error: "We couldn't find an order with those details" }, { status: 404 });

  const items = await db.select({
    productName: orderItems.productName,
    size: orderItems.size,
    quantity: orderItems.quantity,
    totalPaise: orderItems.totalPaise,
  }).from(orderItems).where(eq(orderItems.orderId, order.id));

  return noStore({
    order: {
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      customerName: order.customerName,
      city: order.city,
      state: order.state,
      countryCode: order.countryCode,
      postalCode: order.postalCode,
      totalPaise: order.totalPaise,
      courierName: order.courierName,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      createdAt: order.createdAt,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      items,
    },
  });
}
