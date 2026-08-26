import { NextResponse } from "next/server";
import { resetPasswordWithCode, sessionCookie, signSession } from "../../../../../lib/auth";
import { recordEvent } from "../../../../../lib/logging";
import { checkRateLimit, clientAddress, rateLimitResponse } from "../../../../../lib/rate-limit";
import { rejectCrossSite } from "../../../../../lib/security";

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const rate = checkRateLimit(`password-reset:${clientAddress(request)}`, 8, 15 * 60 * 1000, 30 * 60 * 1000);
  if (!rate.allowed) {
    await recordEvent({ severity: "security", eventType: "auth.password_reset_rate_limited", detail: "IP rate limit" });
    return rateLimitResponse(rate.retryAfterSeconds);
  }
  try {
    const payload = await request.json() as { email?: string; code?: string; password?: string };
    const user = await resetPasswordWithCode(payload.email ?? "", payload.code ?? "", payload.password ?? "");
    const response = NextResponse.json({ ok: true });
    const cookie = sessionCookie(await signSession(user));
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    await recordEvent({ severity: "security", eventType: "auth.password_reset_succeeded", actorId: user.id });
    return response;
  } catch (error) {
    await recordEvent({ severity: "security", eventType: "auth.password_reset_failed", detail: "Invalid recovery attempt" });
    return Response.json({ error: error instanceof Error ? error.message : "We could not reset your password" }, { status: 400 });
  }
}
