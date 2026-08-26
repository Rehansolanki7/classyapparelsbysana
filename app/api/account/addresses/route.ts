import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { addresses } from "../../../../db/schema";
import { currentUser } from "../../../../lib/auth";
import { type AddressInput, validateAddress } from "../../../../lib/customer";
import { recordEvent } from "../../../../lib/logging";
import { rejectCrossSite } from "../../../../lib/security";

async function signedInUser() {
  const user = await currentUser();
  return user?.id ? user : null;
}

export async function GET() {
  const user = await signedInUser();
  if (!user) return Response.json({ error: "Sign in to manage addresses." }, { status: 401 });
  const items = await getDb().select().from(addresses).where(eq(addresses.userId, user.id)).orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
  return Response.json({ addresses: items });
}

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request); if (rejected) return rejected;
  const user = await signedInUser();
  if (!user) return Response.json({ error: "Sign in to save an address." }, { status: 401 });
  try {
    const payload = await request.json() as { address?: AddressInput };
    const parsed = validateAddress(payload.address ?? {});
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
    const db = getDb();
    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      const existing = await tx.select({ id: addresses.id }).from(addresses).where(eq(addresses.userId, user.id)).limit(1);
      const isDefault = parsed.address.isDefault || !existing.length;
      if (isDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, user.id));
      await tx.insert(addresses).values({ id, userId: user.id, ...parsed.address, isDefault });
    });
    const [address] = await db.select().from(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, user.id))).limit(1);
    await recordEvent({ severity: "info", eventType: "account.address_created", actorId: user.id, entityType: "address", entityId: id });
    return Response.json({ address }, { status: 201 });
  } catch {
    await recordEvent({ severity: "error", eventType: "account.address_create_failed", actorId: user.id, detail: "Database or input failure" });
    return Response.json({ error: "We could not save that address. Please try again." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const rejected = rejectCrossSite(request); if (rejected) return rejected;
  const user = await signedInUser();
  if (!user) return Response.json({ error: "Sign in to edit an address." }, { status: 401 });
  try {
    const payload = await request.json() as { id?: string; address?: AddressInput };
    const id = payload.id?.slice(0, 36) ?? "";
    const parsed = validateAddress(payload.address ?? {});
    if (!id || "error" in parsed) return Response.json({ error: "error" in parsed ? parsed.error : "Address not found." }, { status: 400 });
    const db = getDb();
    const [existing] = await db.select({ id: addresses.id }).from(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, user.id))).limit(1);
    if (!existing) return Response.json({ error: "Address not found." }, { status: 404 });
    await db.transaction(async (tx) => {
      if (parsed.address.isDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, user.id));
      await tx.update(addresses).set(parsed.address).where(and(eq(addresses.id, id), eq(addresses.userId, user.id)));
    });
    const [address] = await db.select().from(addresses).where(eq(addresses.id, id)).limit(1);
    await recordEvent({ severity: "info", eventType: "account.address_updated", actorId: user.id, entityType: "address", entityId: id });
    return Response.json({ address });
  } catch {
    await recordEvent({ severity: "error", eventType: "account.address_update_failed", actorId: user.id, detail: "Database or input failure" });
    return Response.json({ error: "We could not update that address. Please try again." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const rejected = rejectCrossSite(request); if (rejected) return rejected;
  const user = await signedInUser();
  if (!user) return Response.json({ error: "Sign in to remove an address." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id")?.slice(0, 36) ?? "";
  if (!id) return Response.json({ error: "Address not found." }, { status: 400 });
  const db = getDb();
  const [existing] = await db.select({ id: addresses.id, isDefault: addresses.isDefault }).from(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, user.id))).limit(1);
  if (!existing) return Response.json({ error: "Address not found." }, { status: 404 });
  await db.transaction(async (tx) => {
    await tx.delete(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, user.id)));
    if (existing.isDefault) {
      const [next] = await tx.select({ id: addresses.id }).from(addresses).where(eq(addresses.userId, user.id)).orderBy(desc(addresses.createdAt)).limit(1);
      if (next) await tx.update(addresses).set({ isDefault: true }).where(eq(addresses.id, next.id));
    }
  });
  await recordEvent({ severity: "info", eventType: "account.address_deleted", actorId: user.id, entityType: "address", entityId: id });
  return Response.json({ ok: true });
}
