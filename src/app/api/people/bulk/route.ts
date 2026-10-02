import { addPerson } from "@/lib/pipeline";
import { parseBulk } from "@/lib/scrape/urls";
import { isAdmin, kick } from "@/lib/server";

// Admin-only: paste many "linkedin instagram" lines at once (the demo pool).
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: string; adminKey?: string; cohort?: string };
  if (!(await isAdmin(body.adminKey))) return Response.json({ error: "Admin key required for bulk add." }, { status: 403 });
  const { ok, errors } = parseBulk(body.text ?? "");
  const added = [];
  for (const l of ok) {
    const r = await addPerson(l, { cohort: body.cohort === "guest" ? "guest" : "demo", consent: true });
    added.push({ ...r, linkedin: l.linkedinId, instagram: l.instagramUsername });
  }
  await kick(true);
  return Response.json({ added, errors });
}
