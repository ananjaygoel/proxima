import Link from "next/link";
import { Avatar, InstagramIcon, KindBadge, LinkedInIcon } from "@/components/ui";
import { recentDates, roster, stats } from "@/lib/views";

export const dynamic = "force-dynamic";

const STEPS = [
  { t: "Two links", d: "A LinkedIn and a public Instagram. Nothing else, ever." },
  { t: "The agent reads", d: "Every role, post, caption and photo, with notes that cite the source." },
  { t: "Profile page", d: "Needs, hobbies, interests, values, personality: each claim backed by evidence." },
  { t: "The agents date", d: "Speed dates with everyone, then real first dates with the best fits." },
  { t: "Ranking", d: "Each person's best fits, scored by both agents after the date." },
];

export default async function Home() {
  const [s, people, dates] = await Promise.all([stats(), roster(), recentDates({ kind: "full", limit: 6 })]);
  const demo = people.filter((p) => p.cohort === "demo" && p.status === "ready");
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <section className="grid items-center gap-10 py-14 md:grid-cols-[1.15fr_1fr] md:py-20">
        <div>
          <p className="label mb-4">Agentic dating</p>
          <h1 className="h-serif text-5xl leading-[1.05] text-text md:text-6xl">
            Your agent goes on <span className="italic text-gold">the date first.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Paste a LinkedIn and a public Instagram. An AI agent reads both, writes a profile with evidence for every claim, then goes on dates
            with every other person&apos;s agent, on that person&apos;s behalf. You get a ranking of who fits you best, and the transcripts to prove it.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/add" className="btn">
              Add yourself
            </Link>
            <Link href="/demo" className="btn-ghost">
              Open the finished demo →
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-6 text-sm">
            <Stat n={s.ready} l="people with an agent" />
            <Stat n={s.speed} l="speed dates" />
            <Stat n={s.full} l="full dates" />
            {s.running > 0 ? <Stat n={s.running} l="dates happening now" live /> : null}
          </div>
        </div>
        <div className="card relative overflow-hidden p-6">
          <p className="label mb-4">The pipeline</p>
          <ol className="space-y-3">
            {STEPS.map((st, i) => (
              <li key={st.t} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-2 text-xs text-gold">{i + 1}</span>
                <div>
                  <div className="font-semibold">
                    {st.t}
                    {i === 0 ? (
                      <span className="ml-2 inline-flex gap-1.5 align-middle text-muted">
                        <LinkedInIcon /> <InstagramIcon />
                      </span>
                    ) : null}
                  </div>
                  <div className="text-sm text-muted">{st.d}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {demo.length > 0 ? (
        <section className="pb-12">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="h-serif text-2xl">The people</h2>
            <Link href="/people" className="text-sm text-muted hover:text-gold">
              All {demo.length} →
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {demo.map((p) => (
              <Link key={p.id} href={`/p/${p.id}`} className="group flex items-center gap-2 rounded-full border border-line bg-panel py-1 pl-1 pr-3 hover:border-gold-2">
                <Avatar p={p} size={28} />
                <span className="text-sm group-hover:text-gold">{p.first}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {dates.length > 0 ? (
        <section className="pb-16">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="h-serif text-2xl">Latest first dates</h2>
            <Link href="/dates" className="text-sm text-muted hover:text-gold">
              All dates →
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {dates.map((d) => (
              <Link key={d.id} href={`/d/${d.id}`} className="card group p-4 hover:border-gold-2">
                <div className="flex items-center gap-2">
                  <Avatar p={d.a} size={34} ring="gold" />
                  <span className="text-rose">♥</span>
                  <Avatar p={d.b} size={34} ring="rose" />
                  <div className="ml-2 min-w-0">
                    <div className="truncate font-medium group-hover:text-gold">
                      {d.a.first} & {d.b.first}
                    </div>
                    <div className="truncate text-xs text-muted">{d.place ?? "—"}</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                  <KindBadge kind={d.kind} origin={d.origin} />
                  {d.status === "done" ? (
                    <span>
                      fit {d.fitAB} / {d.fitBA}
                    </span>
                  ) : (
                    <span className="text-amber">happening now</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ n, l, live }: { n: number; l: string; live?: boolean }) {
  return (
    <div>
      <div className={`h-serif text-3xl ${live ? "text-amber" : "text-gold"}`}>{n}</div>
      <div className="text-muted">{l}</div>
    </div>
  );
}
