import { couponDiscount } from "../../../../lib/coupons";
import { rejectCrossSite } from "../../../../lib/security";

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const payload = (await request.json()) as { code?: string; subtotalPaise?: number };
  const subtotalPaise = Math.max(0, Math.min(10_000_000, Math.floor(Number(payload.subtotalPaise) || 0)));
  try {
    const result = await couponDiscount(payload.code, subtotalPaise);
    return Response.json(result, { status: result.error ? 400 : 200 });
  } catch { return Response.json({ error: "Coupons are temporarily unavailable." }, { status: 503 }); }
}
