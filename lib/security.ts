export async function hmacSha256Hex(secret: string, message: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(left: string, right: string) {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a.charCodeAt(index % Math.max(a.length, 1)) || 0) ^ (b.charCodeAt(index % Math.max(b.length, 1)) || 0);
  }
  return difference === 0;
}

export function rejectCrossSite(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  // On Hostinger, the Node application can receive an internal/proxied request
  // URL while the browser correctly sends the public website as its Origin.
  // Allow only that configured public origin as well as the request origin.
  const allowedOrigins = new Set([new URL(request.url).origin]);
  const siteUrl = process.env.SITE_URL?.trim();
  if (siteUrl) {
    try {
      allowedOrigins.add(new URL(siteUrl).origin);
    } catch {
      // An invalid optional SITE_URL must not widen the allowed-origin list.
    }
  }

  if (!allowedOrigins.has(origin)) {
    return Response.json({ error: "Cross-site request rejected" }, { status: 403 });
  }
  return null;
}
