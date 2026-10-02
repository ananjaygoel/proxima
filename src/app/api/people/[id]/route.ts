import { q } from "@/lib/db";
import { getPerson } from "@/lib/repo";
import { creatorToken, isAdmin } from "@/lib/server";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = await getPerson(id);
  if (!p) return Response.json({ error: "not found" }, { status: 404 });
  const url = new URL(req.url);
  const token = await creatorToken();
  const allowed = (await isAdmin(url.searchParams.get("key"))) || (p.creator_token && token === p.creator_token);
  if (!allowed) return Response.json({ error: "Only the person who added this profile (or an admin) can remove it." }, { status: 403 });
  await q(`DELETE FROM jobs WHERE payload->>'personId' = $1 OR payload->>'dateId' IN (SELECT id FROM dates WHERE a_id=$1 OR b_id=$1)`, [id]);
  await q(`DELETE FROM people WHERE id=$1`, [id]);
  return Response.json({ ok: true });
}
