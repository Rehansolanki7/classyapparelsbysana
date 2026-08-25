import { rejectUnlessAdmin } from "../../../../lib/admin-auth";
import { saveUpload } from "../../../../lib/uploads";

const allowedTypes = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);

export async function POST(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;
  const form = await request.formData();
  const file = form.get("image");
  if (!(file instanceof File)) return Response.json({ error: "Choose an image" }, { status: 400 });
  const extension = allowedTypes.get(file.type);
  if (!extension) return Response.json({ error: "Use a JPG, PNG or WebP image" }, { status: 415 });
  if (file.size > 4 * 1024 * 1024) return Response.json({ error: "Image must be under 4 MB" }, { status: 413 });
  const key = `products/${crypto.randomUUID()}.${extension}`;
  const url = await saveUpload(key, await file.arrayBuffer());
  return Response.json({ url }, { status: 201 });
}
