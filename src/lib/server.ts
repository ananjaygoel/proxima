import { cookies, headers } from "next/headers";
import { nanoid } from "nanoid";
import { config } from "./config";
import { one, q } from "./db";
import { pendingCount, tickUrl, workerAliveWithin } from "./jobs";

// Request helpers shared by the API routes.

export async function isAdmin(provided?: string | null): Promise<boolean> {
  if (!config.adminKey) return process.env.NODE_ENV !== "production"; // open locally, closed in prod unless a key is set
  const c = (await cookies()).get("px_admin")?.value;
  return provided === config.adminKey || c === config.adminKey;
}

export async function creatorToken(create = false): Promise<string | null> {
  const jar = await cookies();
  let t = jar.get("px_creator")?.value ?? null;
  if (!t && create) {
    t = nanoid(24);
    jar.set("px_creator", t, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365, path: "/" });
  }
  return t;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local";
}

// Increments a daily counter and returns whether it is still within `limit`.
export async function underLimit(key: string, limit: number): Promise<boolean> {
  const r = await one<{ count: number }>(
    `INSERT INTO rate (key, day, count) VALUES ($1, current_date, 1)
     ON CONFLICT (key, day) DO UPDATE SET count = rate.count + 1 RETURNING count`,
    [key],
  );
  return (r?.count ?? 0) <= limit;
}

// Make sure a worker is draining the queue. On Vercel this starts a /api/tick
// invocation (which runs for up to ~5 minutes and re-invokes itself while work
// remains). Cheap to call from every poll: it does nothing if a worker
// heartbeat is recent or the queue is empty.
export async function kick(force = false) {
  if (process.env.DISABLE_AUTO_TICK === "1") return;
  try {
    if (!force && (await workerAliveWithin(20))) return;
    if ((await pendingCount()) === 0) return;
    // mark alive now so concurrent polls don't all start ticks
    await q(`INSERT INTO meta (key, value, updated_at) VALUES ('tick','{}'::jsonb, now()) ON CONFLICT (key) DO UPDATE SET updated_at = now()`);
    await fetch(tickUrl(), { method: "POST", headers: { "x-tick-secret": config.tickSecret }, signal: AbortSignal.timeout(8000) }).catch(() => {});
  } catch {
    // never let a kick break the request that triggered it
  }
}
