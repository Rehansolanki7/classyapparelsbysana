import type { Metadata } from "next";
import { asc, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "../../db";
import { coupons, instagramImports, orders } from "../../db/schema";
import { currentUser, isAdmin } from "../../lib/auth";
import { getAllProducts } from "../../lib/catalog";
import { orderNotificationsConfigured } from "../../lib/integrations";
import { uploadUrl } from "../../lib/uploads";
import AdminDashboard from "./admin-dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin studio", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const user = await currentUser();
  if (!user || !isAdmin(user)) redirect("/admin/login?return_to=/admin");
  const products = await getAllProducts();
  let imports: Array<typeof instagramImports.$inferSelect & { imageUrl: string }> = [];
  let recentOrders: Array<typeof orders.$inferSelect> = [];
  let initialCoupons: Array<typeof coupons.$inferSelect> = [];
  try {
    const db = getDb();
    const [importRows, orderRows, couponRows] = await Promise.all([
      db.select().from(instagramImports).orderBy(asc(instagramImports.createdAt)).limit(100),
      db.select().from(orders).orderBy(desc(orders.createdAt)).limit(100),
      db.select().from(coupons).orderBy(desc(coupons.createdAt)).limit(200),
    ]);
    imports = importRows.map((item) => ({ ...item, imageUrl: item.imageKey ? uploadUrl(item.imageKey) : item.sourceUrl }));
    recentOrders = orderRows;
    initialCoupons = couponRows;
  } catch { /* The setup card in the dashboard is still useful before MySQL is connected. */ }
  return <AdminDashboard user={user} initialProducts={products} initialImports={imports} initialOrders={recentOrders} initialCoupons={initialCoupons} signOutPath="/logout" notificationConfigured={orderNotificationsConfigured()} />;
}
