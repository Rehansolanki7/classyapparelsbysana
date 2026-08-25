import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { instagramImports } from "../../../../db/schema";
import { rejectUnlessAdmin } from "../../../../lib/admin-auth";
import { saveUpload } from "../../../../lib/uploads";

type InstagramMedia = { id: string; caption?: string; media_type?: string; media_url?: string; thumbnail_url?: string; permalink?: string; timestamp?: string };

function imageExtension(contentType: string) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

export async function POST(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  const userId = process.env.INSTAGRAM_USER_ID?.trim() || "me";
  if (!accessToken) return Response.json({ error: "Instagram is not connected yet", code: "INSTAGRAM_NOT_CONFIGURED" }, { status: 503 });
  const endpoint = new URL(`https://graph.instagram.com/${encodeURIComponent(userId)}/media`);
  endpoint.searchParams.set("fields", "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp");
  endpoint.searchParams.set("limit", "25");
  endpoint.searchParams.set("access_token", accessToken);
  const response = await fetch(endpoint, { headers: { accept: "application/json" } });
  if (!response.ok) return Response.json({ error: "Instagram sync failed. Reconnect the account and try again." }, { status: 502 });
  const payload = (await response.json()) as { data?: InstagramMedia[] };
  const db = getDb();
  let imported = 0;
  for (const media of payload.data ?? []) {
    const remoteImage = media.media_type === "VIDEO" ? media.thumbnail_url : media.media_url;
    if (!media.id || !remoteImage) continue;
    const [existing] = await db.select({ id: instagramImports.id }).from(instagramImports).where(eq(instagramImports.instagramMediaId, media.id)).limit(1);
    if (existing) continue;
    let imageKey = "";
    try {
      const imageResponse = await fetch(remoteImage);
      const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
      if (imageResponse.ok && contentType.startsWith("image/")) {
        imageKey = `instagram/${media.id}.${imageExtension(contentType)}`;
        await saveUpload(imageKey, await imageResponse.arrayBuffer());
      }
    } catch { imageKey = ""; }
    await db.insert(instagramImports).values({ instagramMediaId: media.id, caption: media.caption?.slice(0, 5000) ?? "", mediaType: media.media_type ?? "IMAGE", imageKey, sourceUrl: remoteImage, permalink: media.permalink ?? "", publishedAt: media.timestamp ? media.timestamp.slice(0, 19).replace("T", " ") : null });
    imported += 1;
  }
  return Response.json({ imported, checked: payload.data?.length ?? 0 });
}
