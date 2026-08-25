import { deleteSessionCookie } from "../../../../lib/auth";
import { rejectCrossSite } from "../../../../lib/security";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const response = NextResponse.json({ ok: true });
  const cookie = deleteSessionCookie();
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
