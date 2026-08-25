import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getDb } from "../db";
import { emailOtps, users } from "../db/schema";
import { sendLoginCodeEmail } from "./email";

export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "customer";
  /** True only after the private administrator access-key sign-in. */
  adminAuthenticated: boolean;
};
export const SESSION_COOKIE = "classy_apparels_session";

function dbTime(date = new Date()) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase().slice(0, 180);
}

function secret() {
  const value = process.env.AUTH_SECRET?.trim();
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
  return new TextEncoder().encode(value);
}

function codeHash(email: string, code: string) {
  return createHash("sha256").update(`${email}:${code}:${process.env.AUTH_SECRET ?? ""}`).digest("hex");
}

export function ownerEmail() {
  return normalizeEmail(process.env.OWNER_EMAIL ?? "shop@classyapparelsbysana.com");
}

function sameSecret(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function adminAccessKey() {
  const value = process.env.ADMIN_ACCESS_KEY?.trim();
  if (!value || value.length < 32) throw new Error("ADMIN_ACCESS_KEY must be a private value of at least 32 characters");
  return value;
}

function adminAccessKeyVersion() {
  return createHash("sha256").update(adminAccessKey()).digest("base64url");
}

/** A single private Hostinger environment value unlocks the admin dashboard. */
export async function signInAdministratorWithAccessKey(accessKey: string) {
  if (!sameSecret(accessKey, adminAccessKey())) throw new Error("That admin access key is not correct");
  return { id: "admin-access-key", email: ownerEmail(), name: "", role: "owner", adminAuthenticated: true } satisfies AppUser;
}

export async function requestEmailCode(emailInput: string, purpose: "sign_in" | "recovery") {
  const email = normalizeEmail(emailInput);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");
  const db = getDb();
  const tenMinutesAgo = dbTime(new Date(Date.now() - 10 * 60 * 1000));
  const recent = await db.select({ id: emailOtps.id }).from(emailOtps).where(and(eq(emailOtps.email, email), gt(emailOtps.createdAt, tenMinutesAgo))).orderBy(desc(emailOtps.id)).limit(4);
  if (recent.length >= 3) throw new Error("Too many codes were requested. Please wait 10 minutes.");
  const code = randomInt(100000, 1000000).toString();
  const inserted = await db.insert(emailOtps).values({
    email,
    purpose,
    codeHash: codeHash(email, code),
    expiresAt: dbTime(new Date(Date.now() + 10 * 60 * 1000)),
  });
  try {
    await sendLoginCodeEmail(email, code, purpose);
  } catch (error) {
    await db.delete(emailOtps).where(eq(emailOtps.id, inserted[0].insertId));
    throw error;
  }
  return { email };
}

export async function verifyEmailCode(emailInput: string, codeInput: string, purpose: "sign_in" | "recovery"): Promise<AppUser> {
  const email = normalizeEmail(emailInput);
  const code = codeInput.replace(/\D/g, "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) throw new Error("Enter your email and the 6-digit code");
  const db = getDb();
  const [otp] = await db.select().from(emailOtps).where(and(eq(emailOtps.email, email), eq(emailOtps.purpose, purpose), isNull(emailOtps.usedAt), gt(emailOtps.expiresAt, dbTime()), lt(emailOtps.attempts, 5))).orderBy(desc(emailOtps.id)).limit(1);
  if (!otp) throw new Error("This code has expired. Request a new one.");
  if (!sameSecret(otp.codeHash, codeHash(email, code))) {
    await db.update(emailOtps).set({ attempts: sql`${emailOtps.attempts} + 1` }).where(eq(emailOtps.id, otp.id));
    throw new Error("That code is not correct. Please try again.");
  }
  const now = dbTime();
  await db.update(emailOtps).set({ usedAt: now }).where(eq(emailOtps.id, otp.id));
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const role = email === ownerEmail() ? "owner" : (existing?.role ?? "customer");
  const id = existing?.id ?? crypto.randomUUID();
  if (existing) {
    await db.update(users).set({ role, emailVerifiedAt: now, updatedAt: now }).where(eq(users.id, existing.id));
  } else {
    await db.insert(users).values({ id, email, role, emailVerifiedAt: now });
  }
  return { id, email, name: existing?.name ?? "", role, adminAuthenticated: false };
}

export async function signSession(user: AppUser) {
  const payload: { email: string; name: string; adminAuthenticated: boolean; adminKeyVersion?: string } = { email: user.email, name: user.name, adminAuthenticated: user.adminAuthenticated };
  if (user.adminAuthenticated) payload.adminKeyVersion = adminAccessKeyVersion();
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(user.adminAuthenticated ? "12h" : "30d")
    .sign(secret());
}

export async function currentUser(): Promise<AppUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    const email = normalizeEmail(payload.email);

    // The private access-key login is intentionally independent of MySQL.
    // It must continue to work even if a customer-data query is temporarily
    // unavailable. Its signature and the current key fingerprint are checked,
    // so this does not trust an arbitrary browser cookie.
    const adminAuthenticated = payload.adminAuthenticated === true && typeof payload.adminKeyVersion === "string" && sameSecret(payload.adminKeyVersion, adminAccessKeyVersion());
    if (adminAuthenticated && email === ownerEmail()) {
      return {
        id: payload.sub,
        email,
        name: typeof payload.name === "string" ? payload.name : "",
        role: "owner",
        adminAuthenticated: true,
      };
    }

    const db = getDb();
    const [stored] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    // Never trust an old role embedded in a cookie. This makes removing someone
    // from the admin list take effect immediately, even on their existing device.
    const role = email === ownerEmail() ? "owner" : (stored?.role ?? "customer");
    return {
      id: stored?.id ?? payload.sub,
      email,
      name: stored?.name ?? (typeof payload.name === "string" ? payload.name : ""),
      role,
      adminAuthenticated,
    };
  } catch {
    return null;
  }
}

export function sessionCookie(value: string, administrator = false) {
  return { name: SESSION_COOKIE, value, options: { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: administrator ? 60 * 60 * 12 : 60 * 60 * 24 * 30 } };
}

export function deleteSessionCookie() {
  return { name: SESSION_COOKIE, value: "", options: { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 } };
}

export function isAdmin(user: AppUser | null) {
  return Boolean(user?.adminAuthenticated && (user.role === "owner" || user.role === "admin"));
}
