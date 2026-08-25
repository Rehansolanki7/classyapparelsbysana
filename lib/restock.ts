import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { productVariants, restockSubscriptions } from "../db/schema";
import { sendMail } from "./email";

export async function notifyRestock(variantIds: number[]) {
  if (!variantIds.length) return;
  const db = getDb();
  for (const variantId of variantIds) {
    const [variant] = await db.select().from(productVariants).where(eq(productVariants.id, variantId)).limit(1);
    if (!variant || variant.stock <= 0 || !variant.active) continue;
    const subscriptions = await db.select().from(restockSubscriptions).where(and(eq(restockSubscriptions.variantId, variantId), isNull(restockSubscriptions.notifiedAt)));
    for (const subscription of subscriptions) {
      try { await sendMail({ to: subscription.email, subject: "Your Classy Apparels size is back", html: `<p>Good news — the size you requested is back in stock.</p><p><a href="${(process.env.SITE_URL ?? "https://classyapparelsbysana.com").replace(/\/$/, "")}/shop">Shop now</a></p>` }); await db.update(restockSubscriptions).set({ notifiedAt: new Date().toISOString().slice(0, 19).replace("T", " ") }).where(eq(restockSubscriptions.id, subscription.id)); } catch { /* A retry can be made after email settings are fixed. */ }
    }
  }
}
