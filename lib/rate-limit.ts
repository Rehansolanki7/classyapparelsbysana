type Bucket = { attempts: number; resetAt: number; blockedUntil: number };

declare global {
  var classyApparelsRateLimits: Map<string, Bucket> | undefined;
}

function buckets() {
  if (!global.classyApparelsRateLimits) global.classyApparelsRateLimits = new Map();
  return global.classyApparelsRateLimits;
}

export function clientAddress(request: Request) {
  return (request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown").slice(0, 80);
}

export function checkRateLimit(key: string, limit: number, windowMs: number, blockMs = windowMs) {
  const now = Date.now();
  const store = buckets();
  const existing = store.get(key);
  if (existing?.blockedUntil && existing.blockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.blockedUntil - now) / 1000)) };
  }
  const bucket = !existing || existing.resetAt <= now
    ? { attempts: 0, resetAt: now + windowMs, blockedUntil: 0 }
    : existing;
  bucket.attempts += 1;
  if (bucket.attempts > limit) bucket.blockedUntil = now + blockMs;
  store.set(key, bucket);

  if (store.size > 2_000) {
    for (const [storedKey, value] of store) if (value.resetAt <= now && value.blockedUntil <= now) store.delete(storedKey);
  }
  return bucket.blockedUntil > now
    ? { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1000)) }
    : { allowed: true, retryAfterSeconds: 0 };
}

export function rateLimitResponse(retryAfterSeconds: number) {
  return Response.json(
    { error: "Too many attempts. Please wait and try again." },
    { status: 429, headers: { "retry-after": String(retryAfterSeconds), "cache-control": "no-store" } },
  );
}
