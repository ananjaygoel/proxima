import { q, one } from "./db";
import type { InstagramData, LinkedInData, PersonRow, PersonStatus } from "./types";
import type { Profile, Debrief, SpeedVerdict, Turn, Invite, Scenes } from "./agent/schemas";

export async function getPerson(id: string) {
  return one<PersonRow>(`SELECT * FROM people WHERE id = $1`, [id]);
}

export async function listPeople(opts: { cohort?: "demo" | "guest" | "all" } = {}) {
  const cohort = opts.cohort ?? "all";
  return q<PersonRow>(
    `SELECT * FROM people ${cohort === "all" ? "" : "WHERE cohort = $1"} ORDER BY cohort ASC, created_at ASC`,
    cohort === "all" ? [] : [cohort],
  );
}

export async function setStatus(id: string, status: PersonStatus, detail: string | null = null, error: string | null = null) {
  await q(`UPDATE people SET status=$2, stage_detail=$3, error=$4, updated_at=now() WHERE id=$1`, [id, status, detail, error]);
}

export async function saveSource(personId: string, kind: "linkedin" | "instagram", data: LinkedInData | InstagramData, via: string) {
  await q(
    `INSERT INTO sources (person_id, kind, data, fetched_via) VALUES ($1,$2,$3::jsonb,$4)
     ON CONFLICT (person_id, kind) DO UPDATE SET data = EXCLUDED.data, fetched_via = EXCLUDED.fetched_via, fetched_at = now()`,
    [personId, kind, JSON.stringify(data), via],
  );
}

export async function getSources(personId: string) {
  const rows = await q<{ kind: string; data: unknown; fetched_via: string; fetched_at: string }>(
    `SELECT kind, data, fetched_via, fetched_at FROM sources WHERE person_id = $1`,
    [personId],
  );
  const li = rows.find((r) => r.kind === "linkedin");
  const ig = rows.find((r) => r.kind === "instagram");
  return {
    linkedin: (li?.data as LinkedInData) ?? null,
    instagram: (ig?.data as InstagramData) ?? null,
    linkedinVia: li?.fetched_via ?? null,
    instagramVia: ig?.fetched_via ?? null,
    fetchedAt: li?.fetched_at ?? ig?.fetched_at ?? null,
  };
}

export type NoteRow = { id: number; source: string; ref: string | null; quote: string | null; observation: string; category: string | null; created_at: string };

export async function getNotes(personId: string, afterId = 0) {
  return q<NoteRow>(`SELECT id, source, ref, quote, observation, category, created_at FROM notes WHERE person_id=$1 AND id > $2 ORDER BY id ASC`, [
    personId,
    afterId,
  ]);
}

export async function getProfile(personId: string) {
  const r = await one<{ data: Profile; model: string; created_at: string }>(`SELECT data, model, created_at FROM profiles WHERE person_id=$1`, [personId]);
  return r ? r.data : null;
}

export async function getProfiles(ids: string[]) {
  if (!ids.length) return new Map<string, Profile>();
  const rows = await q<{ person_id: string; data: Profile }>(`SELECT person_id, data FROM profiles WHERE person_id = ANY($1)`, [ids]);
  return new Map(rows.map((r) => [r.person_id, r.data]));
}

export type TurnRecord =
  | ({ kind: "turn"; speaker: "a" | "b"; at: string } & Turn)
  | { kind: "scene"; text: string; at: string }
  | { kind: "invite"; speaker: "a"; message: string; plan: Invite["plan"]; at: string }
  | { kind: "reply"; speaker: "b"; message: string; tweak: string; at: string };

export type DatePlan = { invite?: Invite; scenes?: Scenes; setting?: string };

export type DateRow = {
  id: string;
  kind: "speed" | "full";
  origin: "season" | "guest" | "live";
  a_id: string;
  b_id: string;
  pair_key: string;
  status: "queued" | "running" | "done" | "error";
  stage: string | null;
  plan: DatePlan | null;
  turns: TurnRecord[];
  verdict_a: (Debrief | SpeedVerdict) | null;
  verdict_b: (Debrief | SpeedVerdict) | null;
  fit_ab: number | null;
  fit_ba: number | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export async function getDate(id: string) {
  return one<DateRow>(`SELECT * FROM dates WHERE id=$1`, [id]);
}

export async function datesFor(personId: string) {
  return q<DateRow>(`SELECT * FROM dates WHERE a_id=$1 OR b_id=$1 ORDER BY created_at DESC`, [personId]);
}

export async function imageIdsFor(personId: string) {
  return q<{ id: string; kind: string; ref: string | null }>(`SELECT id, kind, ref FROM images WHERE person_id=$1`, [personId]);
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);
