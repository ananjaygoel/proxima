import { q } from "./db";
import { datesFor, getDate, getNotes, getPerson, getProfile, getProfiles, getSources, imageIdsFor, type DateRow } from "./repo";
import { siteRankings, type RankEntry } from "./rank";
import type { PersonRow } from "./types";
import type { Profile } from "./agent/schemas";
import { firstName } from "./agent/persona";

// Read models for the pages.

export type PersonLite = {
  id: string;
  name: string;
  first: string;
  photo: string | null;
  headline: string | null;
  city: string | null;
  status: PersonRow["status"];
  cohort: PersonRow["cohort"];
  tagline: string | null;
  synthetic: boolean;
};

export function lite(p: PersonRow, prof?: Profile | null): PersonLite {
  return {
    id: p.id,
    name: p.name ?? `@${p.instagram_username}`,
    first: firstName(p, prof),
    photo: p.photo_image_id,
    headline: p.headline,
    city: prof?.city && prof.city !== "unknown" ? prof.city : p.city,
    status: p.status,
    cohort: p.cohort,
    tagline: prof?.tagline ?? null,
    synthetic: !!p.synthetic,
  };
}

export async function peopleMap() {
  const people = await q<PersonRow>(`SELECT * FROM people ORDER BY created_at`);
  const profiles = await getProfiles(people.map((p) => p.id));
  return { people, profiles, byId: new Map(people.map((p) => [p.id, lite(p, profiles.get(p.id))])) };
}

// What a ready person's agent is doing: waiting for the season, out dating, or done.
export async function datingPhases(): Promise<Map<string, "profile" | "dating" | "ranked">> {
  const rows = await q<{ pid: string; pending: number; done: number }>(
    `SELECT pid, sum(CASE WHEN status IN ('queued','running') THEN 1 ELSE 0 END)::int AS pending, sum(CASE WHEN status='done' THEN 1 ELSE 0 END)::int AS done
     FROM (SELECT a_id AS pid, status FROM dates WHERE origin <> 'live' UNION ALL SELECT b_id AS pid, status FROM dates WHERE origin <> 'live') x GROUP BY pid`,
  );
  return new Map(rows.map((r) => [r.pid, r.pending > 0 ? "dating" : r.done > 0 ? "ranked" : "profile"]));
}

export function displayStatus(status: string, phase?: "profile" | "dating" | "ranked") {
  if (status !== "ready") return status;
  return phase === "dating" ? "dating" : phase === "ranked" ? "ranked" : "profile";
}

export async function roster() {
  const { people, profiles, byId } = await peopleMap();
  const [ranks, phases] = await Promise.all([siteRankings(), datingPhases()]);
  return people.map((p) => {
    const prof = profiles.get(p.id) ?? null;
    const top = ranks.get(p.id)?.[0];
    return {
      ...lite(p, prof),
      hobbies: prof?.hobbies.slice(0, 3).map((h) => h.name) ?? [],
      topMatch: top ? { ...byId.get(top.otherId)!, score: top.score, mutual: top.mutual } : null,
      error: p.error,
      stage: p.stage_detail,
      display: displayStatus(p.status, phases.get(p.id)),
    };
  });
}

export async function stats() {
  const r = await q<{ people: number; ready: number; speed: number; full: number; running: number; demo: number }>(
    `SELECT (SELECT count(*)::int FROM people) AS people,
            (SELECT count(*)::int FROM people WHERE status='ready') AS ready,
            (SELECT count(*)::int FROM people WHERE cohort='demo') AS demo,
            (SELECT count(*)::int FROM dates WHERE kind='speed' AND status='done') AS speed,
            (SELECT count(*)::int FROM dates WHERE kind='full' AND status='done') AS full,
            (SELECT count(*)::int FROM dates WHERE status='running') AS running`,
  );
  return r[0];
}

export type DateCard = {
  id: string;
  kind: DateRow["kind"];
  origin: DateRow["origin"];
  status: DateRow["status"];
  a: PersonLite;
  b: PersonLite;
  fitAB: number | null;
  fitBA: number | null;
  callA: string | null;
  callB: string | null;
  place: string | null;
  when: string;
};

function callOf(v: DateRow["verdict_a"]): string | null {
  if (!v) return null;
  return "second_date" in v ? v.second_date : v.next;
}

export function toCard(d: DateRow, byId: Map<string, PersonLite>): DateCard | null {
  const a = byId.get(d.a_id);
  const b = byId.get(d.b_id);
  if (!a || !b) return null;
  return {
    id: d.id,
    kind: d.kind,
    origin: d.origin,
    status: d.status,
    a,
    b,
    fitAB: d.fit_ab,
    fitBA: d.fit_ba,
    callA: callOf(d.verdict_a),
    callB: callOf(d.verdict_b),
    place: d.plan?.invite ? `${d.plan.invite.plan.place}, ${d.plan.invite.plan.area}` : null,
    when: d.finished_at ?? d.started_at ?? d.created_at,
  };
}

export async function recentDates(opts: { kind?: "speed" | "full"; limit?: number; status?: string } = {}) {
  const { byId } = await peopleMap();
  const rows = await q<DateRow>(
    `SELECT * FROM dates WHERE ($1::text IS NULL OR kind=$1) AND ($2::text IS NULL OR status=$2)
     ORDER BY CASE WHEN status='running' THEN 0 ELSE 1 END, COALESCE(finished_at, started_at, created_at) DESC LIMIT $3`,
    [opts.kind ?? null, opts.status ?? null, opts.limit ?? 60],
  );
  return rows.map((d) => toCard(d, byId)).filter(Boolean) as DateCard[];
}

export type RankView = RankEntry & { other: PersonLite };

export async function personView(id: string) {
  const person = await getPerson(id);
  if (!person) return null;
  const [profile, sources, notes, images, dates, maps, ranks, phases] = await Promise.all([
    getProfile(id),
    getSources(id),
    getNotes(id),
    imageIdsFor(id),
    datesFor(id),
    peopleMap(),
    siteRankings(),
    datingPhases(),
  ]);
  const refImages: Record<string, string> = {};
  for (const im of images) if (im.ref) refImages[im.ref] = im.id;
  const ranking: RankView[] = (ranks.get(id) ?? []).map((r) => ({ ...r, other: maps.byId.get(r.otherId)! })).filter((r) => r.other);
  return {
    person,
    me: lite(person, profile),
    profile,
    sources,
    notes,
    refImages,
    dates: dates.map((d) => toCard(d, maps.byId)).filter(Boolean) as DateCard[],
    ranking,
    display: displayStatus(person.status, phases.get(id)),
  };
}

export async function dateView(id: string) {
  const d = await getDate(id);
  if (!d) return null;
  const [pa, pb, profA, profB] = await Promise.all([getPerson(d.a_id), getPerson(d.b_id), getProfile(d.a_id), getProfile(d.b_id)]);
  if (!pa || !pb) return null;
  return { date: d, a: lite(pa, profA), b: lite(pb, profB), profA, profB };
}

export async function rankingsView() {
  const { people, profiles, byId } = await peopleMap();
  const ranks = await siteRankings();
  const ready = people.filter((p) => profiles.has(p.id));
  return {
    people: ready.map((p) => lite(p, profiles.get(p.id))),
    ranks: Object.fromEntries([...ranks.entries()].map(([k, v]) => [k, v.map((r) => ({ ...r, other: byId.get(r.otherId)! })).filter((r) => r.other)])) as Record<
      string,
      RankView[]
    >,
  };
}
