import { q } from "@/lib/db";
import { queueStats } from "@/lib/jobs";
import { isAdmin } from "@/lib/server";
import { usageSummary } from "@/lib/usage";

// Admin-only JSON view of the queue, recent errors, dates and spend.
export async function GET(req: Request) {
  if (!(await isAdmin(new URL(req.url).searchParams.get("key")))) return Response.json({ error: "Admin key required." }, { status: 403 });
  const [queue, errors, dates, usage, tick] = await Promise.all([
    queueStats(),
    q(`SELECT id, type, status, attempts, left(last_error, 300) AS last_error, run_after FROM jobs WHERE last_error IS NOT NULL ORDER BY id DESC LIMIT 15`),
    q(`SELECT kind, status, count(*)::int AS n FROM dates GROUP BY 1,2 ORDER BY 1,2`),
    usageSummary(),
    q(`SELECT updated_at, now() - updated_at AS age FROM meta WHERE key='tick'`),
  ]);
  return Response.json({ queue, errors, dates, usage, tick });
}
