import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const contentTypes: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

function storageDirectory() {
  const configured = process.env.UPLOAD_DIR?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("UPLOAD_DIR must point to permanent writable storage in production");
  return path.join(process.cwd(), "public", "uploads");
}

function safePath(key: string) {
  const clean = key.replace(/^\/+/, "");
  if (!clean || clean.includes("..") || !/^[a-zA-Z0-9/_\-.]+$/.test(clean)) throw new Error("Invalid upload path");
  const root = path.resolve(/* turbopackIgnore: true */ storageDirectory());
  const target = path.resolve(root, clean);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Invalid upload path");
  return { clean, target };
}

export function uploadUrl(key: string) {
  // `/media` is served by this Next.js app, so files can live in a permanent
  // writable folder outside Hostinger's read-only build versions.
  const base = (process.env.UPLOAD_PUBLIC_PATH?.trim() || "/media").replace(/\/$/, "");
  return `${base}/${key.replace(/^\/+/, "")}`;
}

export async function saveUpload(key: string, bytes: ArrayBuffer | Uint8Array) {
  const { clean, target } = safePath(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes instanceof ArrayBuffer ? Buffer.from(new Uint8Array(bytes)) : Buffer.from(bytes));
  return uploadUrl(clean);
}

export async function readUpload(key: string) {
  const { target } = safePath(key);
  const bytes = await readFile(/* turbopackIgnore: true */ target);
  const extension = key.split(".").pop()?.toLowerCase() ?? "";
  return { bytes, contentType: contentTypes[extension] ?? "application/octet-stream" };
}
