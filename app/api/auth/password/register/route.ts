import { NextResponse } from "next/server";
import { registerWithVerifiedEmail, sessionCookie, signSession } from "../../../../../lib/auth";
import { recordEvent } from "../../../../../lib/logging";
import { checkRateLimit, clientAddress, rateLimitResponse } from "../../../../../lib/rate-limit";
import { rejectCrossSite } from "../../../../../lib/security";

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const rate = checkRateLimit(`password-register:${clientAddress(request)}`, 5, 60 * 60 * 1000, 60 * 60 * 1000);
  if (!rate.allowed) {
    await recordEvent({ severity: "security", eventType: "auth.registration_rate_limited", detail: "IP rate limit" });
    return rateLimitResponse(rate.retryAfterSeconds);
  }
  try {
    const payload = await request.json() as { name?: string; email?: string; code?: string; password?: string };
    const user = await registerWithVerifiedEmail(payload.email ?? "", payload.code ?? "", payload.password ?? "", payload.name);
    const response = NextResponse.json({ ok: true, user: { email: user.email, role: user.role } }, { status: 201 });
    const cookie = sessionCookie(await signSession(user));
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    await recordEvent({ severity: "security", eventType: "auth.account_created", actorId: user.id });
    return response;
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "We could not create your account" }, { status: 400 });
  }
}
