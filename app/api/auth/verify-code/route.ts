import { sessionCookie, signSession, verifyEmailCode } from "../../../../lib/auth";
import { rejectCrossSite } from "../../../../lib/security";
import { NextResponse } from "next/server";
import { checkRateLimit, clientAddress, rateLimitResponse } from "../../../../lib/rate-limit";

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const rate = checkRateLimit(`otp-verify:${clientAddress(request)}`, 20, 15 * 60 * 1000, 30 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
  try {
    const payload = (await request.json()) as { email?: string; code?: string; purpose?: "sign_in" | "recovery" };
    const purpose = payload.purpose === "recovery" ? "recovery" : "sign_in";
    const user = await verifyEmailCode(payload.email ?? "", payload.code ?? "", purpose);
    const response = NextResponse.json({ ok: true, user: { email: user.email, role: user.role } });
    const cookie = sessionCookie(await signSession(user));
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "We could not verify that code" }, { status: 400 });
  }
}
