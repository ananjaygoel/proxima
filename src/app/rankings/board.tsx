"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar, Bar, KindBadge, ScoreRing } from "@/components/ui";
import type { PersonLite, RankView } from "@/lib/views";

type View = "person" | "mutual" | "matrix";

export function RankingsBoard({ people, ranks, initial, initialView }: { people: PersonLite[]; ranks: Record<string, RankView[]>; initial: string | null; initialView: View }) {
  const ranked = people.filter((p) => (ranks[p.id] ?? []).length > 0);
  const [sel, setSel] = useState<string | null>(initial && ranks[initial] ? initial : ranked[0]?.id ?? null);
  const [view, setView] = useState<View>(initialView);
  const [cohort, setCohort] = useState<"demo" | "guest">(people.find((p) => p.id === initial)?.cohort ?? "demo");
  const list = ranked.filter((p) => p.cohort === cohort);
  const me = people.find((p) => p.id === sel) ?? null;

  const mutual = (() => {
    const seen = new Set<string>();
    const out: { a: PersonLite; b: PersonLite; ab: RankView; ba: RankView | undefined; avg: number }[] = [];
    for (const p of ranked.filter((x) => x.cohort === "demo")) {
      for (const r of ranks[p.id] ?? []) {
        const k = [p.id, r.otherId].sort().join(":");
        if (seen.has(k) || r.other.cohort !== "demo") continue;
        seen.add(k);
        const back = (ranks[r.otherId] ?? []).find((x) => x.otherId === p.id);
        out.push({ a: p, b: r.other, ab: r, ba: back, avg: Math.round((r.myFit + r.theirFit) / 2) });
      }
    }
    return out.filter((x) => x.ab.mutual).sort((x, y) => y.avg - x.avg);
  })();

  if (!ranked.length) return <div className="card mt-8 p-10 text-center text-muted">Rankings appear once the agents have been on dates.</div>;

  return (
    <div className="mt-6">
      <div className="mb-5 flex flex-wrap gap-2">
        {(
          [
            ["person", "Per person"],
            ["mutual", `Mutual matches (${mutual.length})`],
            ["matrix", "Everyone × everyone"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} className={`chip !px-3 !py-1 !text-sm ${view === k ? "!border-gold-2 !text-gold" : ""}`}>
            {l}
          </button>
        ))}
      </div>

      {view === "person" ? (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="card max-h-[75vh] overflow-y-auto p-2 scrollbar-thin">
            {ranked.some((p) => p.cohort === "guest") ? (
              <div className="mb-2 flex gap-1 p-1">
                {(["demo", "guest"] as const).map((c) => (
                  <button key={c} onClick={() => setCohort(c)} className={`chip flex-1 justify-center ${cohort === c ? "!border-gold-2 !text-gold" : ""}`}>
                    {c === "demo" ? "Demo season" : "Visitors"}
                  </button>
                ))}
              </div>
            ) : null}
            {list.map((p) => (
              <button
                key={p.id}
                onClick={() => setSel(p.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${sel === p.id ? "bg-panel-2 ring-1 ring-gold-2/50" : "hover:bg-panel-2"}`}
              >
                <Avatar p={p} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted">
                    #1: {ranks[p.id]?.[0]?.other.first} · {ranks[p.id]?.[0]?.score}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div>
            {me ? (
              <>
                <div className="mb-4 flex items-center gap-3">
                  <Avatar p={me} size={48} ring="gold" />
                  <div>
                    <div className="h-serif text-2xl">Who fits {me.first} best</div>
                    <Link href={`/p/${me.id}`} className="text-sm text-muted hover:text-gold">
                      {me.first}&apos;s profile →
                    </Link>
                  </div>
                </div>
                <div className="card divide-y divide-line">
                  {(ranks[me.id] ?? []).map((r, i) => (
                    <Link key={r.otherId} href={`/d/${r.dateId}`} className="flex items-center gap-4 p-4 hover:bg-panel-2">
                      <span className="h-serif w-8 text-center text-2xl text-gold-2">{i + 1}</span>
                      <Avatar p={r.other} size={42} ring={r.mutual ? "rose" : undefined} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{r.other.name}</span>
                          {r.mutual ? <span className="text-sm text-rose">♥ mutual</span> : null}
                          <KindBadge kind={r.evidence} />
                        </div>
                        <div className="line-clamp-2 text-sm text-muted">{r.reason}</div>
                      </div>
                      <div className="hidden w-36 text-xs md:block">
                        <div className="mb-1 flex justify-between text-muted">
                          <span>{me.first}&apos;s agent</span>
                          <b className="text-text">{r.myFit}</b>
                        </div>
                        <Bar value={r.myFit} />
                        <div className="mb-1 mt-2 flex justify-between text-muted">
                          <span>{r.other.first}&apos;s agent</span>
                          <b className="text-text">{r.theirFit}</b>
                        </div>
                        <Bar value={r.theirFit} color="var(--rose)" />
                      </div>
                      <ScoreRing value={r.score} size={50} />
                    </Link>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {view === "mutual" ? (
        <div className="card divide-y divide-line">
          {mutual.length === 0 ? <div className="p-8 text-center text-muted">No mutual yeses yet.</div> : null}
          {mutual.map((m, i) => (
            <Link key={i} href={`/d/${m.ab.dateId}`} className="flex items-center gap-4 p-4 hover:bg-panel-2">
              <span className="h-serif w-8 text-center text-2xl text-gold-2">{i + 1}</span>
              <Avatar p={m.a} size={40} ring="gold" />
              <span className="text-rose">♥</span>
              <Avatar p={m.b} size={40} ring="rose" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {m.a.first} & {m.b.first}
                </div>
                <div className="line-clamp-1 text-sm text-muted">{m.ab.reason}</div>
              </div>
              <KindBadge kind={m.ab.evidence} />
              <div className="text-right text-xs text-muted">
                {m.a.first}→{m.b.first} <b className="text-gold">{m.ab.myFit}</b>
                <br />
                {m.b.first}→{m.a.first} <b className="text-rose">{m.ab.theirFit}</b>
              </div>
              <ScoreRing value={m.avg} size={48} />
            </Link>
          ))}
        </div>
      ) : null}

      {view === "matrix" ? <Matrix people={ranked.filter((p) => p.cohort === "demo")} ranks={ranks} /> : null}
    </div>
  );
}

function Matrix({ people, ranks }: { people: PersonLite[]; ranks: Record<string, RankView[]> }) {
  const [hover, setHover] = useState<string | null>(null);
  const cell = (a: string, b: string) => (ranks[a] ?? []).find((r) => r.otherId === b);
  const color = (v: number) => {
    const t = Math.max(0, Math.min(1, (v - 20) / 70));
    return `color-mix(in oklab, var(--rose) ${Math.round(t * 100)}%, var(--panel-2))`;
  };
  return (
    <div className="card overflow-x-auto p-4 scrollbar-thin">
      <p className="mb-3 text-sm text-muted">
        Row = whose agent is judging. Column = who they dated. Brighter = better fit (the row person&apos;s agent&apos;s score). {hover ?? "Hover a cell."}
      </p>
      <table className="border-separate border-spacing-[3px]">
        <thead>
          <tr>
            <th />
            {people.map((p) => (
              <th key={p.id} className="p-0">
                <Link href={`/p/${p.id}`} title={p.name}>
                  <Avatar p={p} size={26} />
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map((row) => (
            <tr key={row.id}>
              <td className="pr-2">
                <Link href={`/p/${row.id}`} className="flex items-center gap-2 whitespace-nowrap text-xs text-muted hover:text-gold">
                  <Avatar p={row} size={22} /> {row.first}
                </Link>
              </td>
              {people.map((col) => {
                if (col.id === row.id) return <td key={col.id} className="h-[26px] w-[26px] rounded bg-bg" />;
                const c = cell(row.id, col.id);
                return (
                  <td key={col.id} className="h-[26px] w-[26px] p-0">
                    {c ? (
                      <Link
                        href={`/d/${c.dateId}`}
                        onMouseEnter={() => setHover(`${row.first} → ${col.first}: ${c.myFit} (${c.evidence} date)${c.mutual ? " · mutual ♥" : ""}`)}
                        className={`block h-[26px] w-[26px] rounded text-center text-[9px] leading-[26px] text-bg/80 ${c.evidence === "full" ? "ring-1 ring-gold" : ""}`}
                        style={{ background: color(c.myFit) }}
                      >
                        {c.mutual ? "♥" : ""}
                      </Link>
                    ) : (
                      <div className="h-[26px] w-[26px] rounded bg-bg" />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-faint">Gold outline = they went on a full date. ♥ = both agents said yes.</p>
    </div>
  );
}
