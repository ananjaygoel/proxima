import { q } from "./db";
import type { DateRow } from "./repo";
import type { Debrief, SpeedVerdict } from "./agent/schemas";

// How a ranking is built, for every person P and every person X they dated:
//   my view    = P's agent's fit score for X   (0-100, from P's own debrief)
//   their view = X's agent's fit score for P   (0-100, from X's debrief)
//   score      = 0.65 * my view + 0.35 * their view
// A full date outranks a speed date as evidence: if the pair had a full date,
// only the latest full date counts; otherwise the speed date does.
// "Mutual" = after a first date, both agents said yes to a second one.

export const MY_WEIGHT = 0.65;

export type RankEntry = {
  otherId: string;
  score: number;
  myFit: number;
  theirFit: number;
  evidence: "full" | "speed";
  mutual: boolean;
  myCall: string; // yes / maybe / no
  theirCall: string;
  dateId: string;
  reason: string;
};

type DoneDate = Pick<DateRow, "id" | "kind" | "a_id" | "b_id" | "fit_ab" | "fit_ba" | "verdict_a" | "verdict_b" | "finished_at">;

function call(v: Debrief | SpeedVerdict | null): string {
  if (!v) return "?";
  return "second_date" in v ? v.second_date : v.next;
}

function reasonOf(v: Debrief | SpeedVerdict | null): string {
  if (!v) return "";
  if ("report" in v) return v.report;
  return v.why;
}

export async function loadDoneDates(): Promise<DoneDate[]> {
  return q<DoneDate>(
    `SELECT id, kind, a_id, b_id, fit_ab, fit_ba, verdict_a, verdict_b, finished_at FROM dates WHERE status='done' AND fit_ab IS NOT NULL AND fit_ba IS NOT NULL ORDER BY finished_at ASC`,
  );
}

export function rankingsFrom(dates: DoneDate[], allowed?: (personId: string, otherId: string) => boolean) {
  // best evidence per ordered pair
  const best = new Map<string, DoneDate>();
  for (const d of dates) {
    const k = [d.a_id, d.b_id].sort().join(":");
    const cur = best.get(k);
    if (!cur || (cur.kind === "speed" && d.kind === "full") || (cur.kind === d.kind && (d.finished_at ?? "") > (cur.finished_at ?? ""))) best.set(k, d);
  }
  const out = new Map<string, RankEntry[]>();
  const push = (p: string, e: RankEntry) => {
    if (!out.has(p)) out.set(p, []);
    out.get(p)!.push(e);
  };
  for (const d of best.values()) {
    for (const side of ["a", "b"] as const) {
      const me = side === "a" ? d.a_id : d.b_id;
      const other = side === "a" ? d.b_id : d.a_id;
      if (allowed && !allowed(me, other)) continue;
      const myFit = (side === "a" ? d.fit_ab : d.fit_ba) ?? 0;
      const theirFit = (side === "a" ? d.fit_ba : d.fit_ab) ?? 0;
      const myV = (side === "a" ? d.verdict_a : d.verdict_b) as Debrief | SpeedVerdict | null;
      const theirV = (side === "a" ? d.verdict_b : d.verdict_a) as Debrief | SpeedVerdict | null;
      const myCall = call(myV);
      const theirCall = call(theirV);
      push(me, {
        otherId: other,
        score: Math.round(MY_WEIGHT * myFit + (1 - MY_WEIGHT) * theirFit),
        myFit,
        theirFit,
        evidence: d.kind,
        mutual: d.kind === "full" && myCall === "yes" && theirCall === "yes",
        myCall,
        theirCall,
        dateId: d.id,
        reason: reasonOf(myV),
      });
    }
  }
  for (const list of out.values()) list.sort((x, y) => y.score - x.score || Number(y.mutual) - Number(x.mutual) || y.myFit - x.myFit);
  return out;
}

// Rankings as shown on the site: demo-season people are ranked among the demo
// season only (so visitors trying the site never reshuffle the demo); visitors
// are ranked against everyone they dated.
export async function siteRankings() {
  const [dates, people] = await Promise.all([loadDoneDates(), q<{ id: string; cohort: string }>(`SELECT id, cohort FROM people`)]);
  const cohort = new Map(people.map((p) => [p.id, p.cohort]));
  return rankingsFrom(dates, (me, other) => cohort.get(me) !== "demo" || cohort.get(other) === "demo");
}
