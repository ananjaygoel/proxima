import { q } from "@/lib/db";
import { enqueue } from "@/lib/jobs";
import { isAdmin, kick } from "@/lib/server";

// Admin-only maintenance:
//   requeue_failed  — dates that ended in error go back in the queue (fresh start)
//   replan_full     — drop first dates that haven't started and plan them again
//                     once every speed date is finished
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { adminKey?: string; action?: string };
  if (!(await isAdmin(body.adminKey))) return Response.json({ error: "Admin key required." }, { status: 403 });
  if (body.action === "requeue_failed") {
    const dates = await q<{ id: string; kind: string }>(
      `UPDATE dates SET status='queued', error=NULL, stage=NULL, turns='[]'::jsonb, started_at=NULL WHERE status='error' RETURNING id, kind`,
    );
    await q(`UPDATE jobs SET status='cancelled' WHERE status='failed' AND payload ? 'dateId'`);
    for (const d of dates) await enqueue(d.kind === "speed" ? "speed_date" : "full_date", { dateId: d.id }, { dedupe: `date:${d.id}` });
    await kick(true);
    return Response.json({ requeued: dates.length });
  }
  if (body.action === "replan_full") {
    const gone = await q<{ id: string }>(`DELETE FROM dates WHERE kind='full' AND origin='season' AND status='queued' RETURNING id`);
    await q(`DELETE FROM jobs WHERE type='full_date' AND status='pending' AND NOT EXISTS (SELECT 1 FROM dates d WHERE d.id = jobs.payload->>'dateId')`);
    await enqueue("plan_season_full", {}, { dedupe: "plan_season_full", delaySec: 5 });
    await kick(true);
    return Response.json({ removedQueuedFullDates: gone.length });
  }
  return Response.json({ error: "unknown action" }, { status: 400 });
}
