import { NextResponse } from "next/server";
import { sessionCookie, signSession, verifyAdministratorWithPin } from "../../../../../lib/auth";
import { recordEvent } from "../../../../../lib/logging";
import { checkRateLimit, clientAddress, rateLimitResponse } from "../../../../../lib/rate-limit";
import { rejectCrossSite } from "../../../../../lib/security";

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;

  const rate = checkRateLimit(`admin-mfa-verify:${clientAddress(request)}`, 10, 15 * 60 * 1000, 30 * 60 * 1000);
  if (!rate.allowed) {
    await recordEvent({ severity: "security", eventType: "admin.mfa_pin_verify_rate_limited", detail: "Administrator PIN verification rate limit" });
    return rateLimitResponse(rate.retryAfterSeconds);
  }

  try {
    const payload = (await request.json()) as { accessKey?: string; code?: string };
    const user = await verifyAdministratorWithPin(payload.accessKey ?? "", payload.code ?? "");
    const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
    const cookie = sessionCookie(await signSession(user), true);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    await recordEvent({ severity: "security", eventType: "admin.mfa_sign_in_succeeded", actorId: user.id, detail: "Administrator access verified with both factors" });
    return response;
  } catch {
    await recordEvent({ severity: "security", eventType: "admin.mfa_pin_verify_failed", detail: "Administrator access verification failed" });
    return Response.json({ error: "We could not verify administrator access. Check the key and current PIN, then try again." }, { status: 401, headers: { "cache-control": "no-store" } });
  }
}
