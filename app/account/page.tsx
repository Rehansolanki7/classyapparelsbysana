import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "../../db";
import { addresses, orderItems, orders, users } from "../../db/schema";
import { currentUser } from "../../lib/auth";
import AccountCenter, { type SavedAddress } from "./account-center";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My orders", description: "View your Classy Apparels order history and delivery updates.", robots: { index: false, follow: false } };
const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);
const date = (value: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
const statusLabel = (status: string) => ({ pending_payment: "Payment pending", paid: "Order confirmed", processing: "Being prepared", shipped: "On the way", delivered: "Delivered", cancelled: "Cancelled", payment_failed: "Payment failed", refund_pending: "Refund requested", refunded: "Refunded" }[status] ?? status);

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/login?return_to=/account");
  let history: Array<{ order: typeof orders.$inferSelect; items: Array<typeof orderItems.$inferSelect> }> = [];
  let savedAddresses: SavedAddress[] = [];
  let hasPassword = false;
  let unavailable = false;
  try {
    const db = getDb();
    const [rows, addressRows, storedUser] = await Promise.all([
      // A checkout attempt is not an order. Only show a record after a charge
      // exists (or while that charge is being/has been refunded).
      db.select().from(orders).where(and(
        eq(orders.email, user.email),
        or(eq(orders.paymentStatus, "captured"), eq(orders.paymentStatus, "refunded")),
      )).orderBy(desc(orders.createdAt)).limit(100),
      db.select().from(addresses).where(eq(addresses.userId, user.id)).orderBy(desc(addresses.isDefault), desc(addresses.createdAt)),
      db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1),
    ]);
    history = await Promise.all(rows.map(async (order) => ({ order, items: await db.select().from(orderItems).where(eq(orderItems.orderId, order.id)) })));
    savedAddresses = addressRows;
    hasPassword = Boolean(storedUser[0]?.passwordHash);
  } catch { unavailable = true; }
  return <main className="account-page"><header className="account-header"><Link href="/">← Home</Link><Link className="checkout-wordmark" href="/"><span>Classy Apparels</span></Link><form action="/logout" method="post"><button type="submit">Sign out</button></form></header><section className="account-hero"><div><p className="kicker">Your account</p><h1>My account.</h1></div><div className="account-person"><span>Signed in as</span><strong>{user.name || user.email}</strong><small>{user.email}</small><Link href="/wishlist">View wishlist</Link></div></section>{!unavailable && <AccountCenter user={{ name: user.name, email: user.email }} initialAddresses={savedAddresses} hasPassword={hasPassword} />}<section className="account-orders"><div className="account-orders-heading"><div><p className="kicker">Order history</p><h2>{history.length ? `${history.length} order${history.length === 1 ? "" : "s"}` : "Your orders will appear here"}</h2></div><Link className="button button-dark" href="/shop">Shop</Link></div>{unavailable ? <div className="account-empty"><h3>Orders are temporarily unavailable.</h3><p>Please try again shortly or track an order using its order number and checkout email.</p><Link className="text-link" href="/track-order">Track as guest</Link></div> : !history.length ? <div className="account-empty"><h3>No orders found for this email yet.</h3><p>Orders placed with {user.email} will appear here automatically.</p><div><Link className="button button-dark" href="/shop">Start shopping</Link><Link className="text-link" href="/track-order">Track another order</Link></div></div> : <div className="account-order-list">{history.map(({ order, items }) => <article className="account-order" key={order.id}><div className="account-order-top"><div><span>{order.orderNumber}</span><strong>{statusLabel(order.status)}</strong><small>Placed {date(order.createdAt)}</small></div><strong>{money(order.totalPaise)}</strong></div><div className="account-order-items">{items.map((item) => <div key={item.id}><span>{item.productName}<small>Size {item.size} · Qty {item.quantity}</small></span><strong>{money(item.totalPaise)}</strong></div>)}</div><div className="account-order-actions"><Link className="button button-dark" href={`/track-order?order=${encodeURIComponent(order.orderNumber)}`}>Track order</Link>{order.trackingUrl && <a className="text-link" href={order.trackingUrl} target="_blank" rel="noreferrer">Track with courier</a>}{order.trackingNumber && <span>{order.courierName || "Courier"} · {order.trackingNumber}</span>}</div></article>)}</div>}</section></main>;
}
