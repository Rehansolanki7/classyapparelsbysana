import { currentUser, setPasswordForCurrentUser } from "../../../../lib/auth";
import { recordEvent } from "../../../../lib/logging";
import { rejectCrossSite } from "../../../../lib/security";

export async function PATCH(request: Request) {
  const rejected = rejectCrossSite(request); if (rejected) return rejected;
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to update your password." }, { status: 401 });
  try {
    const payload = await request.json() as { currentPassword?: string; password?: string };
    await setPasswordForCurrentUser(user, payload.password ?? "", payload.currentPassword);
    await recordEvent({ severity: "security", eventType: "account.password_updated", actorId: user.id });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "We could not update your password." }, { status: 400 });
  }
}
