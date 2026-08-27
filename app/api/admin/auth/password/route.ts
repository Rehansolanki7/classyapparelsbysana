import { rejectCrossSite } from "../../../../../lib/security";

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  // Retained only to prevent an old client from accidentally treating this as
  // a working login route. It must never create a session with factor one.
  return Response.json({ error: "Administrator sign-in now requires email verification." }, { status: 410, headers: { "cache-control": "no-store" } });
}
