import { timingSafeEqual } from "node:crypto";
import { runRetentionCleanup } from "../../../../lib/retention";

function authorized(request: Request) {
  const configured = process.env.RETENTION_JOB_SECRET?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!configured || !supplied) return false;
  const left = Buffer.from(configured);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ ok: true, summary: await runRetentionCleanup() }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "Retention cleanup did not complete." }, { status: 500 });
  }
}
