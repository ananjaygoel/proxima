import { insertFixtures, removeFixtures } from "@/lib/fixtures";
import { isAdmin, kick } from "@/lib/server";

// Admin-only smoke test of the whole agent pipeline on the live deployment,
// using clearly fictional personas (no scraping). DELETE removes them.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { adminKey?: string; count?: number };
  if (!(await isAdmin(body.adminKey))) return Response.json({ error: "Admin key required." }, { status: 403 });
  const ids = await insertFixtures("guest", Math.min(4, Math.max(2, body.count ?? 3)));
  await kick(true);
  return Response.json({ ids });
}

export async function DELETE(req: Request) {
  if (!(await isAdmin(new URL(req.url).searchParams.get("key")))) return Response.json({ error: "Admin key required." }, { status: 403 });
  return Response.json({ removed: await removeFixtures() });
}
