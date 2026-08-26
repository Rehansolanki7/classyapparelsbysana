import { and, desc, eq, lt, ne, or } from "drizzle-orm";
import { getDb } from "../db";
import { addresses, emailOtps, orders, privacyRequests, restockSubscriptions, retentionActions, systemEvents, users, wishlistItems } from "../db/schema";
import { sendInactivityReminderEmail } from "./email";
import { errorCode, recordEvent } from "./logging";

const DAY = 24 * 60 * 60 * 1000;
const dbTime = (date: Date) => date.toISOString().slice(0, 19).replace("T", " ");
const olderThan = (days: number) => dbTime(new Date(Date.now() - days * DAY));
const monthsAgo = (months: number) => {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date;
};

type CleanupSummary = {
  otps: number;
  checkoutRecords: number;
  events: number;
  inactivityReminders: number;
  inactiveAccounts: number;
  privacyRequests: number;
  skippedLegalHolds: number;
  failures: number;
};

async function audit(action: string, entityType: string, entityId: string, status: "completed" | "skipped" | "failed", detail = "") {
  try { await getDb().insert(retentionActions).values({ action, entityType, entityId, status, detail: detail.slice(0, 240) }); } catch { /* A retention action must not fail because its optional audit insert is unavailable. */ }
}

function latestDate(values: Array<string | null | undefined>) {
  const timestamps = values.flatMap((value) => value ? [new Date(value).getTime()] : []).filter(Number.isFinite);
  return timestamps.length ? new Date(Math.max(...timestamps)) : null;
}

/**
 * Bounded, idempotent daily cleanup. Paid orders are never deleted here;
 * they remain for the configured seven-financial-year accounting period.
 */
export async function runRetentionCleanup(): Promise<CleanupSummary> {
  const summary: CleanupSummary = { otps: 0, checkoutRecords: 0, events: 0, inactivityReminders: 0, inactiveAccounts: 0, privacyRequests: 0, skippedLegalHolds: 0, failures: 0 };
  const db = getDb();

  try {
    const result = await db.delete(emailOtps).where(or(lt(emailOtps.expiresAt, olderThan(1)), lt(emailOtps.usedAt, olderThan(1))));
    summary.otps = Number(result[0]?.affectedRows ?? 0);
  } catch (error) { summary.failures += 1; await audit("otp_cleanup", "email_otp", "batch", "failed", errorCode(error)); }

  try {
    const expired = await db.select({ id: orders.id, legalHold: orders.legalHold }).from(orders).where(and(lt(orders.createdAt, olderThan(30)), or(eq(orders.status, "pending_payment"), eq(orders.status, "payment_failed"), eq(orders.status, "cancelled")), ne(orders.paymentStatus, "captured"))).limit(100);
    for (const order of expired) {
      if (order.legalHold) { summary.skippedLegalHolds += 1; await audit("checkout_cleanup", "order", order.id, "skipped", "legal_hold"); continue; }
      const deleted = await db.delete(orders).where(and(eq(orders.id, order.id), eq(orders.legalHold, false)));
      if (Number(deleted[0]?.affectedRows ?? 0)) { summary.checkoutRecords += 1; await audit("checkout_cleanup", "order", order.id, "completed"); }
    }
  } catch (error) { summary.failures += 1; await audit("checkout_cleanup", "order", "batch", "failed", errorCode(error)); }

  try {
    const result = await db.delete(systemEvents).where(lt(systemEvents.createdAt, olderThan(90)));
    summary.events = Number(result[0]?.affectedRows ?? 0);
    await db.delete(retentionActions).where(lt(retentionActions.createdAt, olderThan(90)));
  } catch (error) { summary.failures += 1; await audit("event_cleanup", "system_event", "batch", "failed", errorCode(error)); }

  try {
    const oldRequests = await db.select({ id: privacyRequests.id }).from(privacyRequests).where(and(eq(privacyRequests.status, "completed"), lt(privacyRequests.completedAt, olderThan(30)))).limit(100);
    for (const request of oldRequests) {
      await db.delete(privacyRequests).where(eq(privacyRequests.id, request.id));
      summary.privacyRequests += 1;
      await audit("privacy_request_cleanup", "privacy_request", request.id, "completed");
    }
  } catch (error) { summary.failures += 1; await audit("privacy_request_cleanup", "privacy_request", "batch", "failed", errorCode(error)); }

  try {
    const candidates = await db.select().from(users).limit(500);
    const reminderBoundary = monthsAgo(23);
    const cleanupBoundary = monthsAgo(24);
    for (const user of candidates) {
      const [latestOrder] = await db.select({ createdAt: orders.createdAt }).from(orders).where(and(eq(orders.email, user.email), eq(orders.paymentStatus, "captured"))).orderBy(desc(orders.createdAt)).limit(1);
      const lastActivity = latestDate([user.lastLoginAt, user.createdAt, latestOrder?.createdAt]);
      if (!lastActivity || lastActivity > reminderBoundary) continue;
      if (!user.inactivityNoticeSentAt) {
        try {
          await sendInactivityReminderEmail(user.email);
          await db.update(users).set({ inactivityNoticeSentAt: dbTime(new Date()) }).where(eq(users.id, user.id));
          summary.inactivityReminders += 1;
          await audit("inactive_account_reminder", "user", user.id, "completed");
        } catch (error) { summary.failures += 1; await audit("inactive_account_reminder", "user", user.id, "failed", errorCode(error)); }
        continue;
      }
      const noticeDate = new Date(user.inactivityNoticeSentAt);
      if (lastActivity > cleanupBoundary || noticeDate > new Date(Date.now() - 30 * DAY)) continue;
      await db.transaction(async (tx) => {
        await tx.delete(addresses).where(eq(addresses.userId, user.id));
        await tx.delete(wishlistItems).where(eq(wishlistItems.userId, user.id));
        await tx.delete(restockSubscriptions).where(eq(restockSubscriptions.email, user.email));
        await tx.delete(users).where(eq(users.id, user.id));
      });
      summary.inactiveAccounts += 1;
      await audit("inactive_account_cleanup", "user", user.id, "completed", "non_order_data_removed");
    }
  } catch (error) { summary.failures += 1; await audit("inactive_account_cleanup", "user", "batch", "failed", errorCode(error)); }

  await recordEvent({ severity: summary.failures ? "warning" : "info", eventType: "retention.daily_cleanup_completed", entityType: "retention", entityId: new Date().toISOString().slice(0, 10), detail: `otp:${summary.otps},checkout:${summary.checkoutRecords},accounts:${summary.inactiveAccounts},failures:${summary.failures}` });
  return summary;
}
