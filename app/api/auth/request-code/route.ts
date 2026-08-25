import { requestEmailCode } from "../../../../lib/auth";
import { rejectCrossSite } from "../../../../lib/security";
import { checkRateLimit, clientAddress, rateLimitResponse } from "../../../../lib/rate-limit";

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const rate = checkRateLimit(`otp-request:${clientAddress(request)}`, 8, 15 * 60 * 1000, 30 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
  try {
    const payload = (await request.json()) as { email?: string; purpose?: "sign_in" | "recovery" };
    const purpose = payload.purpose === "recovery" ? "recovery" : "sign_in";
    const result = await requestEmailCode(payload.email ?? "", purpose);
    return Response.json({ ok: true, email: result.email });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "We could not send a code" }, { status: 400 });
  }
}
