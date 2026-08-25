import { NextResponse } from "next/server";
import { deleteSessionCookie } from "../../lib/auth";

async function signOut(request: Request) {
  const response = NextResponse.redirect(new URL("/", request.url), { status: 303 });
  const cookie = deleteSessionCookie();
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}

export const POST = signOut;
export const GET = signOut;
