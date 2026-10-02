import { q } from "@/lib/db";
import { getNotes, getPerson } from "@/lib/repo";
import { kick } from "@/lib/server";

// Polled by the profile page while the agent reads and dates.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const after = Number(new URL(req.url).searchParams.get("after") ?? 0) || 0;
  const p = await getPerson(id);
  if (!p) return Response.json({ error: "not found" }, { status: 404 });
  const [notes, dates] = await Promise.all([
    getNotes(id, after),
    q<{ kind: string; status: string; n: number }>(`SELECT kind, status, count(*)::int AS n FROM dates WHERE (a_id=$1 OR b_id=$1) AND origin <> 'live' GROUP BY 1,2`, [id]),
  ]);
  const count = (kind: string, statuses: string[]) => dates.filter((d) => d.kind === kind && statuses.includes(d.status)).reduce((s, d) => s + d.n, 0);
  const running = await q<{ id: string; other: string; kind: string }>(
    `SELECT d.id, CASE WHEN d.a_id=$1 THEN d.b_id ELSE d.a_id END AS other, d.kind FROM dates d WHERE (a_id=$1 OR b_id=$1) AND status='running' ORDER BY started_at DESC LIMIT 3`,
    [id],
  );
  void kick();
  return Response.json({
    status: p.status,
    stage: p.stage_detail,
    error: p.error,
    notes,
    dating: {
      speed: { done: count("speed", ["done"]), total: count("speed", ["done", "queued", "running", "error"]) },
      full: { done: count("full", ["done"]), total: count("full", ["done", "queued", "running", "error"]) },
      running,
    },
  });
}
