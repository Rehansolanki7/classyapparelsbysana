import type { Metadata } from "next";
import { asc, desc, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "../../db";
import { coupons, instagramImports, orderItems, orders, systemEvents } from "../../db/schema";
import { currentUser, isAdmin } from "../../lib/auth";
import { getAllProducts } from "../../lib/catalog";
import { getManagedCategories } from "../../lib/categories";
import { orderNotificationsConfigured } from "../../lib/integrations";
import { uploadUrl } from "../../lib/uploads";
import { getStorefrontSettings } from "../../lib/storefront-settings";
import { getShippingConfiguration } from "../../lib/shipping";
import AdminDashboard from "./admin-dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin studio", robots: { index: false, follow: false } };

type AdminOrder = typeof orders.$inferSelect & {
  items: Array<{ productName: string; size: string; quantity: number }>;
};

export default async function AdminPage() {
  const user = await currentUser();
  if (!user || !isAdmin(user)) redirect("/admin/login?return_to=/admin");
  const [products, storefrontSettings, initialCategories] = await Promise.all([getAllProducts(), getStorefrontSettings(), getManagedCategories(true)]);
  let shippingConfiguration: Awaited<ReturnType<typeof getShippingConfiguration>> = { cards: [], pincodeRules: [], handlingPaise: 5000 };
  try { shippingConfiguration = await getShippingConfiguration(); } catch { /* Admin shows a clear migration/setup state. */ }
  let imports: Array<typeof instagramImports.$inferSelect & { imageUrl: string }> = [];
  let recentOrders: AdminOrder[] = [];
  let initialCoupons: Array<typeof coupons.$inferSelect> = [];
  let recentEvents: Array<typeof systemEvents.$inferSelect> = [];
  try {
    const db = getDb();
    const [importRows, orderRows, couponRows, eventRows] = await Promise.all([
      db.select().from(instagramImports).orderBy(asc(instagramImports.createdAt)).limit(100),
      db.select().from(orders).orderBy(desc(orders.createdAt)).limit(250),
      db.select().from(coupons).orderBy(desc(coupons.createdAt)).limit(200),
      db.select().from(systemEvents).orderBy(desc(systemEvents.createdAt)).limit(200),
    ]);
    imports = importRows.map((item) => ({ ...item, imageUrl: item.imageKey ? uploadUrl(item.imageKey) : item.sourceUrl }));
    const itemRows = orderRows.length
      ? await db.select({ orderId: orderItems.orderId, productName: orderItems.productName, size: orderItems.size, quantity: orderItems.quantity }).from(orderItems).where(inArray(orderItems.orderId, orderRows.map((order) => order.id)))
      : [];
    const itemsByOrder = new Map<string, AdminOrder["items"]>();
    for (const item of itemRows) itemsByOrder.set(item.orderId, [...(itemsByOrder.get(item.orderId) ?? []), item]);
    recentOrders = orderRows.map((order) => ({ ...order, items: itemsByOrder.get(order.id) ?? [] }));
    initialCoupons = couponRows;
    const ordersById = new Map(orderRows.map((order) => [order.id, order]));
    recentEvents = eventRows.map((event) => {
      // Older payment-order events were recorded without a detail string and
      // their temporary customer/cart data was scrubbed by design. Add the
      // order number at read time so those records are still understandable;
      // never recreate or expose data that no longer exists.
      if (event.detail || event.eventType !== "checkout.payment_order_unavailable" || event.entityType !== "order" || !event.entityId) return event;
      const order = ordersById.get(event.entityId);
      if (!order) return event;
      const items = itemsByOrder.get(order.id) ?? [];
      const itemSummary = items.length
        ? items.map((item) => `${item.quantity} x ${item.productName} · size ${item.size}`).join(", ").slice(0, 240)
        : "Product snapshot unavailable; this unpaid checkout was scrubbed before the event was viewed";
      return { ...event, detail: `Order ${order.orderNumber} · Products: ${itemSummary} · Historical record: payment order was unavailable` };
    });
  } catch { /* The setup card in the dashboard is still useful before MySQL is connected. */ }
  return <AdminDashboard user={user} initialProducts={products} initialCategories={initialCategories} initialImports={imports} initialOrders={recentOrders} initialCoupons={initialCoupons} signOutPath="/logout" notificationConfigured={orderNotificationsConfigured()} initialStorefrontSettings={storefrontSettings} initialEvents={recentEvents} initialShippingConfiguration={shippingConfiguration} />;
}
