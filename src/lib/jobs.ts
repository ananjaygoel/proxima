import { config } from "./config";
import { one, q } from "./db";

// A small Postgres job queue. Workers claim jobs with FOR UPDATE SKIP LOCKED,
// so any number of workers (Vercel ticks, the local worker script) can drain
// it in parallel. A crashed worker's job is re-claimed when its lease expires.

export type JobType = "scrape" | "read" | "profile" | "speed_date" | "full_date" | "plan_guest" | "plan_demo_join" | "plan_season_full";

export type Job = {
  id: number;
  type: JobType;
  payload: Record<string, string>;
  attempts: number;
};

// lower = sooner
export const PRIORITY: Record<JobType, number> = {
  full_date: 20, // overridden to 5 for live dates someone is watching
  scrape: 10,
  read: 15,
  profile: 15,
  plan_demo_join: 30,
  speed_date: 40,
  plan_guest: 60,
  plan_season_full: 90,
};

export async function enqueue(type: JobType, payload: Record<string, string>, opts: { priority?: number; dedupe?: string; delaySec?: number } = {}) {
  await q(
    `INSERT INTO jobs (type, payload, priority, dedupe_key, run_after) VALUES ($1,$2::jsonb,$3,$4, now() + make_interval(secs => $5))
     ON CONFLICT (dedupe_key) WHERE status IN ('pending','running') DO NOTHING`,
    [type, JSON.stringify(payload), opts.priority ?? PRIORITY[type], opts.dedupe ?? null, opts.delaySec ?? 0],
  );
}

export async function claim(): Promise<Job | null> {
  return one<Job>(
    `UPDATE jobs SET status='running', lease_until = now() + interval '8 minutes', attempts = attempts + 1
     WHERE id = (
       SELECT id FROM jobs
       WHERE (status='pending' AND run_after <= now()) OR (status='running' AND lease_until < now())
       ORDER BY priority ASC, id ASC
       FOR UPDATE SKIP LOCKED LIMIT 1
     )
     RETURNING id, type, payload, attempts`,
  );
}

export async function complete(id: number) {
  await q(`UPDATE jobs SET status='done', finished_at=now(), lease_until=NULL WHERE id=$1`, [id]);
}

export async function reschedule(id: number, delaySec: number) {
  // not a failure: e.g. a planner waiting for speed dates to finish
  await q(`UPDATE jobs SET status='pending', attempts = attempts - 1, run_after = now() + make_interval(secs => $2), lease_until=NULL WHERE id=$1`, [id, delaySec]);
}

export async function fail(job: Job, err: unknown, maxAttempts = 3): Promise<boolean> {
  const msg = String((err as Error)?.message ?? err).slice(0, 800);
  if (job.attempts < maxAttempts) {
    await q(`UPDATE jobs SET status='pending', last_error=$2, run_after = now() + make_interval(secs => $3), lease_until=NULL WHERE id=$1`, [
      job.id,
      msg,
      15 * job.attempts,
    ]);
    return false;
  }
  await q(`UPDATE jobs SET status='failed', last_error=$2, finished_at=now(), lease_until=NULL WHERE id=$1`, [job.id, msg]);
  return true;
}

export async function queueStats() {
  return q<{ type: string; status: string; n: number }>(`SELECT type, status, count(*)::int AS n FROM jobs GROUP BY 1,2 ORDER BY 1,2`);
}

export async function pendingCount(): Promise<number> {
  const r = await one<{ n: number }>(
    `SELECT count(*)::int AS n FROM jobs WHERE (status='pending') OR (status='running' AND lease_until < now())`,
  );
  return r?.n ?? 0;
}

// ---- tick heartbeat: lets page polls know whether a worker is alive ----
export async function heartbeat() {
  await q(`INSERT INTO meta (key, value, updated_at) VALUES ('tick', '{}'::jsonb, now()) ON CONFLICT (key) DO UPDATE SET updated_at = now()`);
}

export async function workerAliveWithin(sec: number): Promise<boolean> {
  const r = await one<{ alive: boolean }>(`SELECT (now() - updated_at) < make_interval(secs => $1) AS alive FROM meta WHERE key='tick'`, [sec]);
  return Boolean(r?.alive);
}

export const tickUrl = () => `${config.publicOrigin}/api/tick`;
