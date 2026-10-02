import { retryPerson } from "@/lib/pipeline";
import { getPerson } from "@/lib/repo";
import { creatorToken, isAdmin, kick } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = await getPerson(id);
  if (!p) return Response.json({ error: "not found" }, { status: 404 });
  const token = await creatorToken();
  const allowed = (await isAdmin(new URL(req.url).searchParams.get("key"))) || (p.creator_token && token === p.creator_token);
  if (!allowed) return Response.json({ error: "Only the person who added this profile can retry it." }, { status: 403 });
  if (p.status !== "error") return Response.json({ error: "Only failed profiles can be retried." }, { status: 400 });
  await retryPerson(id);
  await kick(true);
  return Response.json({ ok: true });
}
