"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar, Bar, CallBadge, KindBadge, ScoreRing } from "@/components/ui";
import type { DateRow, TurnRecord } from "@/lib/repo";
import type { PersonLite } from "@/lib/views";
import type { Debrief, SpeedVerdict } from "@/lib/agent/schemas";

const STAGE_TEXT: Record<string, string> = {
  asking: "is asking them out",
  replying: "is replying",
  "setting the scene": "Setting the scene",
  talking: "is typing",
  "on the date": "is typing",
  "saying goodnight": "is typing",
  verdicts: "Both agents are writing their verdicts",
  debrief: "Both agents are writing their debriefs",
};

export function DateView({ initial, a, b, needsA, needsB }: { initial: DateRow; a: PersonLite; b: PersonLite; needsA: string[]; needsB: string[] }) {
  const [d, setD] = useState<DateRow>(initial);
  const [showNotes, setShowNotes] = useState(true);
  const bottom = useRef<HTMLDivElement>(null);
  const live = d.status === "queued" || d.status === "running";
  const prevLen = useRef(initial.turns.length);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/dates/${d.id}`, { cache: "no-store" });
        if (r.ok) setD(await r.json());
      } catch {}
    }, 1500);
    return () => clearInterval(t);
  }, [live, d.id]);

  useEffect(() => {
    if (live && d.turns.length > prevLen.current) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    prevLen.current = d.turns.length;
  }, [d.turns.length, live]);

  const person = (s: "a" | "b") => (s === "a" ? a : b);
  const invite = d.turns.find((t) => t.kind === "invite") as Extract<TurnRecord, { kind: "invite" }> | undefined;
  const reply = d.turns.find((t) => t.kind === "reply") as Extract<TurnRecord, { kind: "reply" }> | undefined;
  const convo = d.turns.filter((t) => t.kind === "turn" || t.kind === "scene");
  const lastTurn = [...d.turns].reverse().find((t) => t.kind === "turn") as Extract<TurnRecord, { kind: "turn" }> | undefined;
  const nextSpeaker: "a" | "b" =
    d.kind === "full" ? (lastTurn ? (lastTurn.speaker === "a" ? "b" : "a") : "b") : lastTurn ? (lastTurn.speaker === "a" ? "b" : "a") : "a";
  const vibes = (s: "a" | "b") => d.turns.filter((t): t is Extract<TurnRecord, { kind: "turn" }> => t.kind === "turn" && t.speaker === s).map((t) => t.vibe);
  const plan = d.plan?.invite?.plan;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* header */}
      <div className="card overflow-hidden">
        <div className="flex flex-col items-center gap-4 p-6 text-center">
          <div className="flex items-center gap-3">
            <KindBadge kind={d.kind} origin={d.origin} />
            {live ? (
              <span className="chip !border-amber/40 !text-amber">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber" /> happening now
              </span>
            ) : d.status === "error" ? (
              <span className="chip !text-rose">interrupted</span>
            ) : null}
          </div>
          <div className="flex items-center gap-5">
            <Link href={`/p/${a.id}`} className="flex flex-col items-center gap-2">
              <Avatar p={a} size={84} ring="gold" />
              <span className="font-semibold">{a.first}&apos;s agent</span>
            </Link>
            <span className="h-serif text-4xl text-rose">♥</span>
            <Link href={`/p/${b.id}`} className="flex flex-col items-center gap-2">
              <Avatar p={b} size={84} ring="rose" />
              <span className="font-semibold">{b.first}&apos;s agent</span>
            </Link>
          </div>
          {plan ? (
            <div>
              <div className="h-serif text-2xl">{plan.activity}</div>
              <div className="text-sm text-muted">
                {plan.place} · {plan.area} · {plan.time}
              </div>
            </div>
          ) : d.kind === "speed" ? (
            <div className="text-sm text-muted">Proxima speed-dating night · four minutes, two messages each</div>
          ) : null}
          {a.synthetic || b.synthetic ? (
            <p className="max-w-2xl text-xs text-gold/80">Demo season: fictional people with generated LinkedIn and Instagram content. The date itself is real agent output.</p>
          ) : null}
          <p className="max-w-2xl text-xs text-faint">
            Each agent knows only its own person&apos;s profile and the other person&apos;s public card. Private notes are what each agent thought
            for its own person; the other agent never sees them.
          </p>
        </div>
      </div>

      {/* invite */}
      {invite ? (
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <Bubble side="left" p={a} who={`${a.first}'s agent asks ${b.first} out`} text={invite.message} />
          {reply ? <Bubble side="right" p={b} who={`${b.first}'s agent replies`} text={reply.message} /> : null}
          {plan ? (
            <div className="card-2 p-4 text-sm md:col-span-2">
              <span className="label mr-2">Why this plan</span>
              {plan.why_this_fits}
              {reply?.tweak ? <span className="text-muted"> · Tweak: {reply.tweak}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* the date */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="h-serif text-2xl">The date</h2>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} className="accent-[var(--gold)]" />
          Show what the agents were thinking
        </label>
      </div>
      <div className="mt-4 space-y-4">
        {convo.map((t, i) =>
          t.kind === "scene" ? (
            <div key={i} className="rise mx-auto max-w-2xl px-4 py-2 text-center text-sm italic text-gold/80">
              {t.text}
            </div>
          ) : t.kind === "turn" ? (
            <Turn key={i} t={t} p={person(t.speaker)} side={t.speaker === "a" ? "left" : "right"} showNote={showNotes} />
          ) : null,
        )}
        {live ? (
          <div className="flex items-center gap-3 text-sm text-muted">
            {d.stage && ["talking", "on the date", "saying goodnight", "asking", "replying"].includes(d.stage) ? (
              <>
                <Avatar p={person(d.stage === "asking" ? "a" : d.stage === "replying" ? "b" : nextSpeaker)} size={28} />
                <span>
                  {person(d.stage === "asking" ? "a" : d.stage === "replying" ? "b" : nextSpeaker).first}&apos;s agent {STAGE_TEXT[d.stage]}
                </span>
              </>
            ) : (
              <span>{d.stage ? STAGE_TEXT[d.stage] ?? d.stage : "Waiting for the table…"}</span>
            )}
            <span className="typing">
              <span />
              <span />
              <span />
            </span>
          </div>
        ) : null}
        <div ref={bottom} />
      </div>

      {/* vibe track */}
      {d.turns.some((t) => t.kind === "turn") ? (
        <div className="card mt-8 p-5">
          <p className="label mb-3">How it felt, turn by turn (each agent&apos;s private read, −2 to +2)</p>
          <Vibe values={vibes("a")} label={`${a.first}'s agent`} color="var(--gold)" />
          <Vibe values={vibes("b")} label={`${b.first}'s agent`} color="var(--rose)" />
        </div>
      ) : null}

      {/* verdicts */}
      {d.verdict_a && d.verdict_b ? (
        <>
          <Outcome a={a} b={b} va={d.verdict_a} vb={d.verdict_b} />
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <VerdictCard v={d.verdict_a} me={a} other={b} needs={needsA} color="var(--gold)" />
            <VerdictCard v={d.verdict_b} me={b} other={a} needs={needsB} color="var(--rose)" />
          </div>
        </>
      ) : null}
      {d.status === "error" ? <div className="card mt-6 p-4 text-sm text-rose">This date was interrupted: {d.error}</div> : null}
    </div>
  );
}

function Bubble({ side, p, who, text }: { side: "left" | "right"; p: PersonLite; who: string; text: string }) {
  return (
    <div className={`rise flex gap-3 ${side === "right" ? "flex-row-reverse text-right" : ""}`}>
      <Avatar p={p} size={36} ring={side === "left" ? "gold" : "rose"} />
      <div className={`card-2 max-w-[80%] p-3.5 ${side === "left" ? "rounded-tl-sm" : "rounded-tr-sm"}`}>
        <div className="label mb-1">{who}</div>
        <div className="text-[15px]">{text}</div>
      </div>
    </div>
  );
}

function Turn({ t, p, side, showNote }: { t: Extract<TurnRecord, { kind: "turn" }>; p: PersonLite; side: "left" | "right"; showNote: boolean }) {
  const vibeColor = t.vibe > 0 ? "text-green" : t.vibe < 0 ? "text-rose" : "text-faint";
  return (
    <div className={`rise flex gap-3 ${side === "right" ? "flex-row-reverse" : ""}`}>
      <Avatar p={p} size={36} ring={side === "left" ? "gold" : "rose"} />
      <div className={`flex max-w-[78%] flex-col ${side === "right" ? "items-end" : "items-start"}`}>
        <div className="mb-1 text-xs text-faint">{p.first}&apos;s agent</div>
        <div
          className={`rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
            side === "left" ? "rounded-tl-sm bg-panel-2 ring-1 ring-gold-2/25" : "rounded-tr-sm bg-[#2a1c1a] ring-1 ring-rose-2/30"
          }`}
        >
          {t.say}
        </div>
        {t.gesture ? <div className="mt-1 text-xs italic text-muted">*{t.gesture}*</div> : null}
        {showNote && t.private_note ? (
          <div className={`mt-1.5 max-w-full rounded-lg border border-dashed border-line-2 px-3 py-1.5 text-xs text-muted ${side === "right" ? "text-right" : ""}`}>
            <span className="mr-1">🔒</span>
            <span className="text-faint">private to {p.first}:</span> {t.private_note}{" "}
            <b className={vibeColor}>
              {t.vibe > 0 ? "+" : ""}
              {t.vibe}
            </b>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Vibe({ values, label, color }: { values: number[]; label: string; color: string }) {
  if (!values.length) return null;
  const w = 300;
  const h = 40;
  const pts = values.map((v, i) => `${values.length === 1 ? w / 2 : (i / (values.length - 1)) * w},${h / 2 - (v / 2) * (h / 2 - 4)}`).join(" ");
  return (
    <div className="mb-2 flex items-center gap-4">
      <span className="w-32 shrink-0 text-xs text-muted">{label}</span>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-full max-w-md" preserveAspectRatio="none">
        <line x1="0" x2={w} y1={h / 2} y2={h / 2} stroke="var(--line)" strokeDasharray="3 4" />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

const callOf = (v: Debrief | SpeedVerdict) => ("second_date" in v ? v.second_date : v.next);

function Outcome({ a, b, va, vb }: { a: PersonLite; b: PersonLite; va: Debrief | SpeedVerdict; vb: Debrief | SpeedVerdict }) {
  const ca = callOf(va);
  const cb = callOf(vb);
  const full = "second_date" in va;
  let text = "";
  if (ca === "yes" && cb === "yes") text = full ? "Both agents said yes. Second date recommended." : "Both agents want a real date.";
  else if (ca === "no" && cb === "no") text = "Both agents passed. No spark.";
  else if (ca === "yes" || cb === "yes") text = `${ca === "yes" ? a.first : b.first}'s agent is keen; ${ca === "yes" ? b.first : a.first}'s agent said ${ca === "yes" ? cb : ca}.`;
  else text = "Both agents are on the fence.";
  return (
    <div className="card mt-8 flex flex-col items-center gap-2 p-6 text-center">
      <p className="label">Outcome</p>
      <div className="h-serif text-2xl">{text}</div>
      <div className="flex items-center gap-3 text-sm text-muted">
        {a.first}&apos;s agent: <CallBadge call={ca} /> {b.first}&apos;s agent: <CallBadge call={cb} />
      </div>
    </div>
  );
}

function VerdictCard({ v, me, other, needs, color }: { v: Debrief | SpeedVerdict; me: PersonLite; other: PersonLite; needs: string[]; color: string }) {
  if (!("second_date" in v)) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-3">
          <Avatar p={me} size={36} />
          <div className="flex-1">
            <div className="font-semibold">{me.first}&apos;s agent on {other.first}</div>
            <div className="text-xs text-muted">Real date? <CallBadge call={v.next} /></div>
          </div>
          <ScoreRing value={v.fit} size={52} color={color} />
        </div>
        <p className="mt-3 text-sm">{v.why}</p>
        {v.spark ? <p className="mt-2 text-sm text-green">+ {v.spark}</p> : null}
        {v.concern ? <p className="mt-1 text-sm text-rose">− {v.concern}</p> : null}
      </div>
    );
  }
  const dims = [
    ["Shared interests", v.scores.shared_interests],
    ["Values", v.scores.values_alignment],
    ["Lifestyle", v.scores.lifestyle_fit],
    ["Chemistry", v.scores.conversation_chemistry],
    ["Needs met", v.scores.needs_met],
  ] as const;
  const icon = (x: string) => (x === "met" ? "✓" : x === "partly" ? "~" : x === "not met" ? "✗" : "?");
  const iconColor = (x: string) => (x === "met" ? "text-green" : x === "partly" ? "text-amber" : x === "not met" ? "text-rose" : "text-faint");
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3">
        <Avatar p={me} size={36} />
        <div className="flex-1">
          <div className="font-semibold">{me.first}&apos;s agent, debriefing {me.first}</div>
          <div className="text-xs text-muted">
            Second date? <CallBadge call={v.second_date} />
          </div>
        </div>
        <ScoreRing value={v.fit} size={56} color={color} />
      </div>
      <blockquote className="mt-4 border-l-2 pl-3 text-sm italic" style={{ borderColor: color }}>
        {v.report}
      </blockquote>
      <div className="mt-4 space-y-2">
        {dims.map(([l, x]) => (
          <div key={l} className="flex items-center gap-3 text-xs">
            <span className="w-28 text-muted">{l}</span>
            <Bar value={x} max={10} color={color} />
            <span className="w-5 text-right tabular-nums">{x}</span>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <div className="label mb-2">{me.first}&apos;s needs, checked</div>
        <ul className="space-y-1.5 text-sm">
          {v.needs_check.map((n, i) => (
            <li key={i} className="flex gap-2">
              <span className={`${iconColor(n.verdict)} w-3 font-bold`}>{icon(n.verdict)}</span>
              <span>
                <span>{n.need}</span>
                <span className="block text-xs text-muted">{n.evidence}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      {v.dealbreakers_check.some((x) => x.triggered) ? (
        <div className="mt-3 text-sm text-rose">
          {v.dealbreakers_check
            .filter((x) => x.triggered)
            .map((x, i) => (
              <div key={i}>✗ {x.dealbreaker}: {x.note}</div>
            ))}
        </div>
      ) : null}
      <div className="mt-4 rounded-lg bg-panel-2 p-3 text-sm">
        <div className="label mb-1">Best moment</div>
        <div className="italic">“{v.best_moment.quote}”</div>
        <div className="mt-1 text-xs text-muted">{v.best_moment.why}</div>
      </div>
      {v.concern ? <p className="mt-3 text-sm text-muted"><span className="text-rose">Concern:</span> {v.concern}</p> : null}
    </div>
  );
}
