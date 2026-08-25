import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { orderItems, orders } from "../db/schema";
import { notificationConfiguration } from "./integrations";
import { sendMail } from "./email";
import { countryName } from "./locations";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function rupees(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
}

export async function sendPaidOrderNotifications(orderId: string, force = false) {
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || order.paymentStatus !== "captured" || !["paid", "processing", "shipped", "delivered"].includes(order.status) || (!force && order.adminNotificationStatus === "sent")) return false;

  const config = notificationConfiguration();
  if (!config.adminEmail || !config.fromEmail) {
    await db.update(orders).set({ adminNotificationStatus: "not_configured", updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(orders.id, orderId));
    return false;
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const itemRows = items.map((item) => `<tr><td style="padding:8px 0">${escapeHtml(item.productName)} · ${escapeHtml(item.size)} × ${item.quantity}</td><td style="padding:8px 0;text-align:right">${escapeHtml(rupees(item.totalPaise))}</td></tr>`).join("");
  const address = [order.addressLine1, order.addressLine2, order.city, order.state, order.postalCode, countryName(order.countryCode)].filter(Boolean).map(escapeHtml).join(", ");
  const siteUrl = (process.env.SITE_URL ?? "https://classyapparelsbysana.com").replace(/\/$/, "");
  const adminHtml = `<div style="font-family:Arial,sans-serif;color:#223133;max-width:640px"><h1 style="font-family:Georgia,serif;font-weight:400">New paid order ${escapeHtml(order.orderNumber)}</h1><p><strong>${escapeHtml(order.customerName)}</strong><br>${escapeHtml(order.phone)} · ${escapeHtml(order.email)}</p><p>${address}</p><table style="width:100%;border-collapse:collapse;border-top:1px solid #d8dddd;border-bottom:1px solid #d8dddd">${itemRows}</table><p style="font-size:20px"><strong>Total: ${escapeHtml(rupees(order.totalPaise))}</strong></p><p><a href="${siteUrl}/admin" style="color:#5d9798">Open the Admin Studio</a></p></div>`;
  const trackingUrl = `${siteUrl}/track-order?order=${encodeURIComponent(order.orderNumber)}`;
  const customerHtml = `<div style="font-family:Arial,sans-serif;color:#223133;max-width:640px"><h1 style="font-family:Georgia,serif;font-weight:400">Your Classy Apparels order is confirmed</h1><p>Hi ${escapeHtml(order.customerName)},</p><p>We received your payment for order <strong>${escapeHtml(order.orderNumber)}</strong>.</p><p><a href="${trackingUrl}" style="display:inline-block;padding:12px 18px;background:#223133;color:#fff;text-decoration:none">Track your order</a></p><table style="width:100%;border-collapse:collapse;border-top:1px solid #d8dddd;border-bottom:1px solid #d8dddd">${itemRows}</table><p style="font-size:20px"><strong>Total: ${escapeHtml(rupees(order.totalPaise))}</strong></p><p>Delivery address: ${address}</p><p>Need help? Reply to this email or message us on WhatsApp.</p></div>`;

  try {
    await sendMail({ to: config.adminEmail, subject: `Paid order ${order.orderNumber} · ${rupees(order.totalPaise)}`, html: adminHtml, replyTo: order.email });
    await db.update(orders).set({ adminNotificationStatus: "sent", adminNotifiedAt: sql`CURRENT_TIMESTAMP`, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(orders.id, orderId));
    try {
      await sendMail({ to: order.email, subject: `Order ${order.orderNumber} confirmed`, html: customerHtml, replyTo: config.adminEmail });
    } catch {
      // Admin delivery is the authoritative notification. Customer email is best-effort.
    }
    return true;
  } catch {
    await db.update(orders).set({ adminNotificationStatus: "failed", updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(orders.id, orderId));
    return false;
  }
}
