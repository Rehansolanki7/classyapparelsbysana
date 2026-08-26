import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 } as const;

function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS, (error, value) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
}

export function passwordProblem(password: string) {
  if (password.length < 10) return "Use at least 10 characters for your password.";
  if (password.length > 200) return "Password is too long.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Include at least one letter and one number.";
  return "";
}

/** A versioned, salted one-way password hash. Plain passwords are never persisted. */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await derive(password, salt);
  return `scrypt-v1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined) {
  if (!stored) return false;
  const [version, saltText, hashText] = stored.split("$");
  if (version !== "scrypt-v1" || !saltText || !hashText) return false;
  try {
    const expected = Buffer.from(hashText, "base64url");
    if (expected.length !== KEY_LENGTH) return false;
    const actual = await derive(password, Buffer.from(saltText, "base64url"));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
