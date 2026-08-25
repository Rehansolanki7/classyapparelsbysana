import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { coupons } from "../../../../db/schema";
import { rejectUnlessAdmin } from "../../../../lib/admin-auth";

type CouponPayload = {
  id?: string;
  code?: string;
  type?: "percentage" | "fixed";
  value?: number | string;
  minOrder?: number | string;
  maxDiscount?: number | string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  usageLimit?: number | string | null;
  active?: boolean;
};

type CouponValues = {
  code: string;
  type: "percentage" | "fixed";
  value: number;
  minOrderPaise: number;
  maxDiscountPaise: number | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  active: boolean;
};

const MAX_ORDER_RUPEES = 100_000;
const MAX_USAGE_LIMIT = 1_000_000;

function moneyToPaise(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_ORDER_RUPEES) return null;
  return Math.round(amount * 100);
}

function dateTime(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return undefined;
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function cleanPayload(payload: CouponPayload): { values?: CouponValues; error?: string } {
  const code = (payload.code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,64}$/.test(code)) {
    return { error: "Use a coupon code with 3–64 letters, numbers, hyphens or underscores." };
  }
  if (payload.type !== "percentage" && payload.type !== "fixed") return { error: "Choose a valid discount type." };

  const rawValue = Number(payload.value);
  if (!Number.isFinite(rawValue) || rawValue <= 0) return { error: "Enter a discount greater than zero." };
  if (payload.type === "percentage" && (rawValue > 100 || !Number.isInteger(rawValue))) {
    return { error: "Percentage discounts must be whole numbers from 1 to 100." };
  }
  const value = payload.type === "percentage" ? rawValue : moneyToPaise(rawValue);
  if (value === null) return { error: "Enter a valid fixed discount amount." };

  const minOrderPaise = moneyToPaise(payload.minOrder ?? 0);
  if (minOrderPaise === null) return { error: "Enter a valid minimum order amount." };

  const maxDiscountPaise = payload.type === "percentage" && payload.maxDiscount !== null && payload.maxDiscount !== undefined && payload.maxDiscount !== ""
    ? moneyToPaise(payload.maxDiscount)
    : null;
  if (maxDiscountPaise === null && payload.type === "percentage" && payload.maxDiscount !== null && payload.maxDiscount !== undefined && payload.maxDiscount !== "") {
    return { error: "Enter a valid maximum discount amount." };
  }

  const usageLimit = payload.usageLimit === null || payload.usageLimit === undefined || payload.usageLimit === ""
    ? null
    : Number(payload.usageLimit);
  if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1 || usageLimit > MAX_USAGE_LIMIT)) {
    return { error: "Usage limit must be a whole number between 1 and 1,000,000." };
  }

  const startsAt = dateTime(payload.startsAt);
  const endsAt = dateTime(payload.endsAt);
  if (startsAt === undefined || endsAt === undefined) return { error: "Enter valid start and end dates." };
  if (startsAt && endsAt && startsAt >= endsAt) return { error: "The end date must be after the start date." };

  return {
    values: {
      code,
      type: payload.type,
      value,
      minOrderPaise,
      maxDiscountPaise,
      startsAt,
      endsAt,
      usageLimit,
      active: payload.active !== false,
    },
  };
}

function isDuplicateCode(error: unknown) {
  return (error as { code?: string }).code === "ER_DUP_ENTRY";
}

export async function GET(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;
  const db = getDb();
  return Response.json({ coupons: await db.select().from(coupons).orderBy(desc(coupons.createdAt)).limit(200) });
}

export async function POST(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;

  let payload: CouponPayload;
  try {
    payload = await request.json() as CouponPayload;
  } catch {
    return Response.json({ error: "Invalid coupon details." }, { status: 400 });
  }
  const parsed = cleanPayload(payload);
  if (!parsed.values) return Response.json({ error: parsed.error }, { status: 400 });

  const db = getDb();
  const id = crypto.randomUUID();
  try {
    await db.insert(coupons).values({ id, ...parsed.values });
  } catch (error) {
    if (isDuplicateCode(error)) return Response.json({ error: "That coupon code already exists." }, { status: 409 });
    throw error;
  }
  const [coupon] = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
  return Response.json({ coupon }, { status: 201 });
}

export async function PATCH(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;

  let payload: CouponPayload;
  try {
    payload = await request.json() as CouponPayload;
  } catch {
    return Response.json({ error: "Invalid coupon details." }, { status: 400 });
  }
  if (!payload.id) return Response.json({ error: "Coupon id is required." }, { status: 400 });
  const parsed = cleanPayload(payload);
  if (!parsed.values) return Response.json({ error: parsed.error }, { status: 400 });

  const db = getDb();
  const [existing] = await db.select().from(coupons).where(eq(coupons.id, payload.id)).limit(1);
  if (!existing) return Response.json({ error: "Coupon not found." }, { status: 404 });
  if (existing.usageCount > 0 && parsed.values.code !== existing.code) {
    return Response.json({ error: "A coupon code cannot be changed after it has been used." }, { status: 409 });
  }
  if (parsed.values.usageLimit !== null && parsed.values.usageLimit < existing.usageCount) {
    return Response.json({ error: `Usage limit cannot be lower than the ${existing.usageCount} existing uses.` }, { status: 400 });
  }

  try {
    await db.update(coupons).set({ ...parsed.values, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(coupons.id, existing.id));
  } catch (error) {
    if (isDuplicateCode(error)) return Response.json({ error: "That coupon code already exists." }, { status: 409 });
    throw error;
  }
  const [coupon] = await db.select().from(coupons).where(eq(coupons.id, existing.id)).limit(1);
  return Response.json({ coupon });
}

export async function DELETE(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;

  let payload: Pick<CouponPayload, "id">;
  try {
    payload = await request.json() as Pick<CouponPayload, "id">;
  } catch {
    return Response.json({ error: "Invalid coupon request." }, { status: 400 });
  }
  if (!payload.id) return Response.json({ error: "Coupon id is required." }, { status: 400 });

  const db = getDb();
  const [coupon] = await db.select().from(coupons).where(eq(coupons.id, payload.id)).limit(1);
  if (!coupon) return Response.json({ error: "Coupon not found." }, { status: 404 });
  if (coupon.usageCount > 0) {
    return Response.json({ error: "Used coupons are kept for order history. Deactivate it instead." }, { status: 409 });
  }
  await db.delete(coupons).where(eq(coupons.id, coupon.id));
  return Response.json({ ok: true });
}
