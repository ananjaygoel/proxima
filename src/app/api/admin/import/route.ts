import { importSynthetic, removeSynthetic, type SyntheticPersona } from "@/lib/synthetic";
import { isAdmin, kick } from "@/lib/server";

// Admin-only: load one simulated demo person (generated LinkedIn/Instagram
// content and photos). DELETE removes every simulated person.
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { adminKey?: string; persona?: SyntheticPersona };
  if (!(await isAdmin(body.adminKey))) return Response.json({ error: "Admin key required." }, { status: 403 });
  if (!body.persona?.linkedin || !body.persona?.instagram) return Response.json({ error: "persona missing" }, { status: 400 });
  const r = await importSynthetic(body.persona);
  await kick(true);
  return Response.json(r);
}

export async function DELETE(req: Request) {
  if (!(await isAdmin(new URL(req.url).searchParams.get("key")))) return Response.json({ error: "Admin key required." }, { status: 403 });
  return Response.json({ removed: await removeSynthetic() });
}
