import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { users } from "../../../../db/schema";
import { currentUser } from "../../../../lib/auth";
import { cleanProfileName } from "../../../../lib/customer";
import { recordEvent } from "../../../../lib/logging";
import { rejectCrossSite } from "../../../../lib/security";

export async function PATCH(request: Request) {
  const rejected = rejectCrossSite(request); if (rejected) return rejected;
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to update your profile." }, { status: 401 });
  try {
    const payload = await request.json() as { name?: string };
    const name = cleanProfileName(payload.name);
    if (name.length < 2) return Response.json({ error: "Enter your name." }, { status: 400 });
    await getDb().update(users).set({ name }).where(eq(users.id, user.id));
    await recordEvent({ severity: "info", eventType: "account.profile_updated", actorId: user.id });
    return Response.json({ ok: true, name });
  } catch {
    return Response.json({ error: "We could not update your profile. Please try again." }, { status: 500 });
  }
}
