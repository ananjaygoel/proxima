import { config } from "@/lib/config";
import { createDate } from "@/lib/pipeline";
import { getPerson } from "@/lib/repo";
import { clientIp, isAdmin, kick, underLimit } from "@/lib/server";

// Start a live full date between two ready people (the "Watch a date" page).
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { a?: string; b?: string; adminKey?: string };
  if (!body.a || !body.b || body.a === body.b) return Response.json({ error: "Pick two different people." }, { status: 400 });
  const [a, b] = await Promise.all([getPerson(body.a), getPerson(body.b)]);
  if (!a || !b || a.status !== "ready" || b.status !== "ready")
    return Response.json({ error: "Both people need a finished profile first." }, { status: 400 });
  if (!(await isAdmin(body.adminKey))) {
    const ip = await clientIp();
    if (!(await underLimit(`live:ip:${ip}`, 12))) return Response.json({ error: "That's a lot of dates! Try again tomorrow." }, { status: 429 });
    if (!(await underLimit("live:all", config.liveDateDailyLimitGlobal))) return Response.json({ error: "Today's live-date limit is reached." }, { status: 429 });
  }
  const id = await createDate("full", "live", a.id, b.id, 5);
  await kick(true);
  return Response.json({ id });
}
