import { getDate } from "@/lib/repo";
import { kick } from "@/lib/server";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const d = await getDate(id);
  if (!d) return Response.json({ error: "not found" }, { status: 404 });
  if (d.status !== "done") void kick();
  return Response.json(d);
}
