import { startSeason } from "@/lib/pipeline";
import { isAdmin, kick } from "@/lib/server";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { adminKey?: string };
  if (!(await isAdmin(body.adminKey))) return Response.json({ error: "Admin key required." }, { status: 403 });
  const r = await startSeason();
  await kick(true);
  return Response.json(r);
}
