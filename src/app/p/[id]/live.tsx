"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { InstagramIcon, LinkedInIcon, refLabel } from "@/components/ui";

type Note = { id: number; source: string; ref: string | null; quote: string | null; observation: string; category: string | null };
type Status = {
  status: string;
  stage: string | null;
  error: string | null;
  notes: Note[];
  dating: { speed: { done: number; total: number }; full: { done: number; total: number }; running: { id: string; other: string; kind: string }[] };
};

const STEPS = [
  { key: "queued", label: "In the queue" },
  { key: "scraping", label: "Fetching LinkedIn + Instagram" },
  { key: "reading", label: "Agent reading both sources" },
  { key: "ready", label: "Profile written" },
];

// Live view of the agent reading a person, then dating for them.
export function LiveProgress({
  personId,
  initialStatus,
  refImages,
  names,
  showNotes,
  canRetry,
}: {
  personId: string;
  initialStatus: string;
  refImages: Record<string, string>;
  names: Record<string, string>;
  showNotes: boolean;
  canRetry: boolean;
}) {
  const router = useRouter();
  const [s, setS] = useState<Status | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [shown, setShown] = useState(0);
  const lastId = useRef(0);
  const lastStatus = useRef(initialStatus);
  const lastFull = useRef(-1);

  // Reveal notes one at a time, so a pass that lands all at once still reads like the agent working through it.
  useEffect(() => {
    if (shown >= notes.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), 380);
    return () => clearTimeout(t);
  }, [shown, notes.length]);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`/api/people/${personId}/status?after=${lastId.current}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as Status;
        if (!alive) return;
        if (j.notes.length) {
          lastId.current = j.notes[j.notes.length - 1].id;
          setNotes((n) => [...n, ...j.notes]);
        }
        setS(j);
        const fullDone = j.dating.full.done;
        if (j.status !== lastStatus.current || (lastFull.current >= 0 && fullDone !== lastFull.current)) {
          lastStatus.current = j.status;
          router.refresh();
        }
        lastFull.current = fullDone;
      } catch {}
    };
    poll();
    const t = setInterval(poll, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [personId, router]);

  const status = s?.status ?? initialStatus;
  const reading = status !== "ready" && status !== "excluded";
  const stepIdx = STEPS.findIndex((x) => x.key === status);
  const d = s?.dating;
  const datingActive = d && (d.speed.total > d.speed.done || d.full.total > d.full.done || d.running.length > 0);

  if (status === "error") {
    return (
      <div className="card border-rose/40 p-5">
        <div className="font-semibold text-rose">The agent couldn&apos;t finish this profile</div>
        <p className="mt-1 text-sm text-muted">{s?.error}</p>
        {canRetry ? <RetryButton personId={personId} /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reading ? (
        <div className="card p-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {STEPS.map((st, i) => (
              <div key={st.key} className={`flex items-center gap-2 text-sm ${i < stepIdx ? "text-green" : i === stepIdx ? "text-amber" : "text-faint"}`}>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${i < stepIdx ? "border-green/50" : i === stepIdx ? "border-amber/60" : "border-line-2"}`}>
                  {i < stepIdx ? "✓" : i + 1}
                </span>
                {st.label}
              </div>
            ))}
          </div>
          {s?.stage ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted">
              <span className="typing">
                <span />
                <span />
                <span />
              </span>
              {s.stage}
            </div>
          ) : null}
        </div>
      ) : null}

      {datingActive && !reading ? (
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="flex items-center gap-2 text-amber">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber" /> Agent is out dating
            </span>
            <span className="text-muted">
              Speed dates <b className="text-text">{d!.speed.done}</b>/{d!.speed.total}
            </span>
            <span className="text-muted">
              Full dates <b className="text-text">{d!.full.done}</b>/{d!.full.total || "–"}
            </span>
            {d!.running.map((r) => (
              <Link key={r.id} href={`/d/${r.id}`} className="chip hover:!border-gold-2 hover:!text-gold">
                ● {r.kind === "full" ? "On a date" : "Speed dating"} with {names[r.other] ?? "someone"} →
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {showNotes && reading ? <LiveNotes notes={notes.slice(0, shown)} refImages={refImages} stage={s?.stage ?? null} /> : null}
    </div>
  );
}

function LiveNotes({ notes, refImages, stage }: { notes: Note[]; refImages: Record<string, string>; stage: string | null }) {
  const li = notes.filter((n) => n.source === "linkedin" || n.source === "linkedin_overall");
  const ig = notes.filter((n) => n.source === "instagram" || n.source === "instagram_overall");
  const photos = notes.filter((n) => n.source === "instagram_photo");
  const waiting = (
    <li className="flex items-center gap-2 text-sm text-faint">
      <span className="typing">
        <span />
        <span />
        <span />
      </span>
      reading…
    </li>
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2 text-blue">
            <LinkedInIcon size={16} /> <span className="font-semibold">Reading LinkedIn</span>
            <span className="ml-auto text-xs text-faint">{li.length} notes</span>
          </div>
          <ul className="space-y-3">
            {li.map((n) => (
              <NoteLine key={n.id} n={n} />
            ))}
            {!li.some((n) => n.source === "linkedin_overall") ? waiting : null}
          </ul>
        </div>
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2 text-rose">
            <InstagramIcon size={16} /> <span className="font-semibold">Reading Instagram</span>
            <span className="ml-auto text-xs text-faint">{ig.length} notes</span>
          </div>
          {photos.length ? (
            <div className="mb-4 grid grid-cols-4 gap-2">
              {photos.map((n) =>
                n.ref && refImages[n.ref] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={n.id} src={`/api/img/${refImages[n.ref]}`} alt="" title={`${n.quote} → ${n.observation}`} className="rise aspect-square w-full rounded-md object-cover" />
                ) : null,
              )}
            </div>
          ) : null}
          <ul className="space-y-3">
            {ig.map((n) => (
              <NoteLine key={n.id} n={n} thumb={n.ref ? refImages[n.ref] : undefined} />
            ))}
            {!ig.some((n) => n.source === "instagram_overall") ? waiting : null}
          </ul>
        </div>
      </div>
      {stage === "Writing the profile" ? (
        <div className="card shimmer p-5 text-center text-sm text-gold">Notes done. Now writing the profile from them: needs, hobbies, interests, values, personality…</div>
      ) : null}
    </div>
  );
}

export function NoteLine({ n, thumb }: { n: Note; thumb?: string }) {
  if (n.source.endsWith("_overall")) {
    return (
      <li className="rise rounded-xl border border-gold-2/30 bg-gold/5 p-3 text-sm italic text-gold/90">
        {n.source.startsWith("linkedin") ? "LinkedIn, overall: " : "Instagram, overall: "}
        {n.observation}
      </li>
    );
  }
  const { src, label } = n.ref ? refLabel(n.ref) : { src: "other" as const, label: "" };
  return (
    <li className="rise flex gap-3">
      <div className={`mt-0.5 shrink-0 ${src === "instagram" ? "text-rose" : "text-blue"}`}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/img/${thumb}`} alt="" className="h-10 w-10 rounded-md object-cover" />
        ) : src === "instagram" ? (
          <InstagramIcon size={16} />
        ) : (
          <LinkedInIcon size={16} />
        )}
      </div>
      <div className="min-w-0 text-sm">
        <div className="text-xs text-faint">
          {src === "instagram" ? "Instagram" : "LinkedIn"} · {label}
          {n.category ? <span className="ml-2 text-muted">#{n.category}</span> : null}
        </div>
        {n.quote ? <div className="text-muted">“{n.quote}”</div> : null}
        <div className="text-text">→ {n.observation}</div>
      </div>
    </li>
  );
}

function RetryButton({ personId }: { personId: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <button
      className="btn-ghost mt-3"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/people/${personId}/retry`, { method: "POST" });
        router.refresh();
      }}
    >
      Try again
    </button>
  );
}

export function DeleteButton({ personId, name }: { personId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="text-xs text-faint underline-offset-2 hover:text-rose hover:underline"
      disabled={busy}
      onClick={async () => {
        if (!confirm(`Remove ${name} from Proxima? This deletes their profile, dates and photos.`)) return;
        setBusy(true);
        const r = await fetch(`/api/people/${personId}`, { method: "DELETE" });
        if (r.ok) router.push("/people");
        else {
          setBusy(false);
          alert((await r.json()).error ?? "Couldn't remove.");
        }
      }}
    >
      Remove this profile
    </button>
  );
}
