import { getDb } from "../db";
import { systemEvents } from "../db/schema";
import { lt } from "drizzle-orm";

type Severity = "info" | "warning" | "error" | "security";

type Event = {
  severity: Severity;
  eventType: string;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** A short, non-sensitive diagnostic only. Never log passwords, OTPs, payment data, addresses, emails or request bodies. */
  detail?: string | null;
};

function clean(value: string | null | undefined, maximum: number) {
  return (value ?? "").replace(/[\r\n]/g, " ").slice(0, maximum);
}

/**
 * Records only meaningful security and operational events. Database logging is
 * best-effort so an unavailable database can never turn a customer error into
 * a second outage. Events are automatically retained for 90 days. A safe JSON
 * line remains available in the host logs.
 */
export async function recordEvent(event: Event) {
  const safe = {
    severity: event.severity,
    eventType: clean(event.eventType, 80),
    actorId: event.actorId ? clean(event.actorId, 36) : null,
    entityType: event.entityType ? clean(event.entityType, 60) : null,
    entityId: event.entityId ? clean(event.entityId, 120) : null,
    detail: clean(event.detail, 500),
  };
  console[event.severity === "error" ? "error" : "info"]("classy-event", JSON.stringify(safe));
  try {
    const db = getDb();
    await db.insert(systemEvents).values(safe);
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
    await db.delete(systemEvents).where(lt(systemEvents.createdAt, cutoff));
  } catch {
    // The console line above is the fallback when MySQL is unavailable or the
    // migration has not run yet. Do not recursively log a logger failure.
  }
}

export function errorCode(error: unknown) {
  if (error && typeof error === "object") {
    const named = error as { name?: unknown; code?: unknown; cause?: { code?: unknown } };
    return clean(String(named.code ?? named.cause?.code ?? named.name ?? "UNKNOWN"), 80);
  }
  return "UNKNOWN";
}
