import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { coupons } from "../db/schema";

const dbTime = () => new Date().toISOString().slice(0, 19).replace("T", " ");

export async function couponDiscount(codeInput: string | undefined, subtotalPaise: number) {
  const code = (codeInput ?? "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 64);
  if (!code) return { code: "", discountPaise: 0, error: "" };
  const db = getDb();
  const [coupon] = await db.select().from(coupons).where(eq(coupons.code, code)).limit(1);
  if (!coupon || !coupon.active || (coupon.startsAt && coupon.startsAt > dbTime()) || (coupon.endsAt && coupon.endsAt < dbTime()) || (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit)) return { code, discountPaise: 0, error: "This coupon is not available." };
  if (subtotalPaise < coupon.minOrderPaise) return { code, discountPaise: 0, error: `This coupon needs a minimum order of ₹${Math.ceil(coupon.minOrderPaise / 100)}.` };
  const calculated = coupon.type === "percentage" ? Math.floor(subtotalPaise * coupon.value / 100) : coupon.value;
  return { code, discountPaise: Math.max(0, Math.min(subtotalPaise, coupon.maxDiscountPaise ?? calculated, calculated)), error: "" };
}

export async function markCouponUsed(code: string | null) {
  if (!code) return;
  const db = getDb();
  await db.update(coupons).set({ usageCount: sql`${coupons.usageCount} + 1`, updatedAt: sql`CURRENT_TIMESTAMP` }).where(and(eq(coupons.code, code), or(isNull(coupons.usageLimit), gt(coupons.usageLimit, coupons.usageCount))));
}
