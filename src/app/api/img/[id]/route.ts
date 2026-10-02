import { loadImageB64 } from "@/lib/scrape/images";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const img = await loadImageB64(id);
  if (!img) return new Response("not found", { status: 404 });
  return new Response(Buffer.from(img.data, "base64"), {
    headers: { "content-type": img.mime, "cache-control": "public, max-age=31536000, immutable" },
  });
}
