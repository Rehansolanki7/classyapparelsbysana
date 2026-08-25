import { NextResponse } from "next/server";
import { sessionCookie, signInAdministratorWithAccessKey, signSession } from "../../../../../lib/auth";
import { rejectCrossSite } from "../../../../../lib/security";
import { checkRateLimit, clientAddress, rateLimitResponse } from "../../../../../lib/rate-limit";

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const rate = checkRateLimit(`admin:${clientAddress(request)}`, 5, 15 * 60 * 1000, 30 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
  try {
    const payload = (await request.json()) as { accessKey?: string };
    const user = await signInAdministratorWithAccessKey(payload.accessKey ?? "");
    const response = NextResponse.json({ ok: true });
    const cookie = sessionCookie(await signSession(user), true);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "We could not sign you in" }, { status: 401 });
  }
}
