import { rejectUnlessAdmin } from "../../../../lib/admin-auth";
import { saveUpload } from "../../../../lib/uploads";

const allowedTypes = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_UPLOAD_BYTES + 256 * 1024;

export async function POST(request: Request) {
  const rejected = await rejectUnlessAdmin(request);
  if (rejected) return rejected;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
    return Response.json({ error: "Image upload is too large. Choose a smaller photo and try again." }, { status: 413 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Image upload is too large. Choose a smaller photo and try again." }, { status: 413 });
  }
  const file = form.get("image");
  if (!(file instanceof File)) return Response.json({ error: "Choose an image" }, { status: 400 });
  const extension = allowedTypes.get(file.type);
  if (!extension) return Response.json({ error: "Use a JPG, PNG or WebP image" }, { status: 415 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "Image must be under 4 MB" }, { status: 413 });
  const key = `products/${crypto.randomUUID()}.${extension}`;
  try {
    const url = await saveUpload(key, await file.arrayBuffer());
    return Response.json({ url }, { status: 201 });
  } catch {
    return Response.json({ error: "The image could not be saved. Check the storage connection and try again." }, { status: 500 });
  }
}
