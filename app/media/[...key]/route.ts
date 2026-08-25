import { readUpload } from "../../../lib/uploads";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  try {
    const { key } = await params;
    const upload = await readUpload(key.join("/"));
    return new Response(upload.bytes, { headers: { "content-type": upload.contentType, "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
