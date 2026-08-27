import { requestAdministratorPin } from "../../../../../lib/auth";
import { recordEvent } from "../../../../../lib/logging";
import { checkRateLimit, clientAddress, rateLimitResponse } from "../../../../../lib/rate-limit";
import { rejectCrossSite } from "../../../../../lib/security";

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;

  const address = clientAddress(request);
  const keyRate = checkRateLimit(`admin-mfa-key:${address}`, 5, 15 * 60 * 1000, 30 * 60 * 1000);
  const sendRate = checkRateLimit(`admin-mfa-send:${address}`, 3, 10 * 60 * 1000, 30 * 60 * 1000);
  if (!keyRate.allowed || !sendRate.allowed) {
    await recordEvent({ severity: "security", eventType: "admin.mfa_pin_request_rate_limited", detail: "Administrator PIN request rate limit" });
    return rateLimitResponse(Math.max(keyRate.retryAfterSeconds, sendRate.retryAfterSeconds));
  }

  try {
    const payload = (await request.json()) as { accessKey?: string };
    await requestAdministratorPin(payload.accessKey ?? "");
    await recordEvent({ severity: "security", eventType: "admin.mfa_pin_requested", detail: "Owner-mailbox administrator PIN requested" });
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    await recordEvent({ severity: "security", eventType: "admin.mfa_pin_request_failed", detail: "Administrator PIN request failed" });
    return Response.json({ error: "We could not begin administrator verification. Check your access key and try again." }, { status: 401, headers: { "cache-control": "no-store" } });
  }
}
