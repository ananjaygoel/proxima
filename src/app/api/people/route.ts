import { config } from "@/lib/config";
import { addPerson } from "@/lib/pipeline";
import { parseLinks } from "@/lib/scrape/urls";
import { clientIp, creatorToken, isAdmin, kick, underLimit } from "@/lib/server";
import { listPeople } from "@/lib/repo";

export async function GET() {
  const people = await listPeople();
  return Response.json(
    people.map((p) => ({ id: p.id, name: p.name, cohort: p.cohort, status: p.status, photo: p.photo_image_id, headline: p.headline, city: p.city })),
  );
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { linkedin?: string; instagram?: string; consent?: boolean; adminKey?: string; cohort?: string; invite?: string };
  if (!body.consent) return Response.json({ error: "Please confirm this is you, or that the person agreed to join." }, { status: 400 });
  let links;
  try {
    links = parseLinks(body.linkedin ?? "", body.instagram ?? "");
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  const admin = await isAdmin(body.adminKey);
  const invited = !!config.inviteCode && body.invite === config.inviteCode;
  if (!admin && !invited) {
    const ip = await clientIp();
    if (!(await underLimit(`guest:ip:${ip}`, config.guestDailyLimitPerIp)))
      return Response.json({ error: "You've added the maximum number of people for today from this network." }, { status: 429 });
    if (!(await underLimit("guest:all", config.guestDailyLimitGlobal)))
      return Response.json({ error: "Proxima has hit today's limit for new people. Please try again tomorrow." }, { status: 429 });
  }
  const token = await creatorToken(true);
  const r = await addPerson(links, {
    cohort: invited || (admin && body.cohort === "demo") ? "demo" : "guest",
    consent: true,
    creatorToken: token ?? undefined,
    creatorIp: await clientIp(),
  });
  await kick(true);
  return Response.json(r);
}
