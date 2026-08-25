import { currentUser, isAdmin } from "./auth";
import { rejectCrossSite } from "./security";

export function primaryAdminEmail() {
  return (process.env.ORDER_NOTIFICATION_EMAIL ?? process.env.OWNER_EMAIL ?? "shop@classyapparelsbysana.com").trim().toLowerCase();
}

export async function adminUserFromRequest() {
  const user = await currentUser();
  return isAdmin(user) ? user : null;
}

export async function rejectUnlessAdmin(request: Request) {
  const user = await adminUserFromRequest();
  if (!user) return Response.json({ error: "Admin access required" }, { status: 403 });
  if (request.method !== "GET" && request.method !== "HEAD") {
    return rejectCrossSite(request);
  }
  return null;
}
