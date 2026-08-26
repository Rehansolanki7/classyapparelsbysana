import { NextResponse } from "next/server";
import { sessionCookie, signInWithPassword, signSession } from "../../../../../lib/auth";
import { recordEvent } from "../../../../../lib/logging";
import { checkRateLimit, clientAddress, rateLimitResponse } from "../../../../../lib/rate-limit";
import { rejectCrossSite } from "../../../../../lib/security";

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const rate = checkRateLimit(`password-login:${clientAddress(request)}`, 10, 15 * 60 * 1000, 30 * 60 * 1000);
  if (!rate.allowed) {
    await recordEvent({ severity: "security", eventType: "auth.password_login_rate_limited", detail: "IP rate limit" });
    return rateLimitResponse(rate.retryAfterSeconds);
  }
  try {
    const payload = await request.json() as { email?: string; password?: string };
    const user = await signInWithPassword(payload.email ?? "", payload.password ?? "");
    const response = NextResponse.json({ ok: true, user: { email: user.email, role: user.role } });
    const cookie = sessionCookie(await signSession(user));
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    await recordEvent({ severity: "info", eventType: "auth.password_login_succeeded", actorId: user.id });
    return response;
  } catch (error) {
    await recordEvent({ severity: "security", eventType: "auth.password_login_failed", detail: "Invalid credentials or account" });
    return Response.json({ error: error instanceof Error ? error.message : "We could not sign you in" }, { status: 400 });
  }
}
