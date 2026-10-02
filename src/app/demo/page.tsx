import Link from "next/link";
import { Avatar, DemoNote } from "@/components/ui";
import { q } from "@/lib/db";
import { roster, stats } from "@/lib/views";

export const dynamic = "force-dynamic";
export const metadata = { title: "The demo season" };

// The finished example, already run: a guided path through it.
export default async function DemoPage() {
  const [s, people] = await Promise.all([stats(), roster()]);
  const demo = people.filter((p) => p.cohort === "demo" && p.status === "ready");
  const best = await q<{ id: string; a_id: string; b_id: string; avg: number }>(
    `SELECT d.id, d.a_id, d.b_id, (d.fit_ab + d.fit_ba) / 2.0 AS avg FROM dates d
     JOIN people pa ON pa.id = d.a_id AND pa.cohort = 'demo' JOIN people pb ON pb.id = d.b_id AND pb.cohort = 'demo'
     WHERE d.kind='full' AND d.status='done' ORDER BY avg DESC LIMIT 1`,
  );
  const ex = demo[0];
  const byId = new Map(people.map((p) => [p.id, p]));
  const bd = best[0];
  if (demo.length < 2) {
    const joined = people.filter((p) => p.cohort === "demo").length;
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <p className="label">The demo season</p>
        <h1 className="h-serif mt-2 text-4xl">The season is filling up</h1>
        <p className="mt-3 text-lg text-muted">
          {joined} {joined === 1 ? "person has" : "people have"} joined so far. As each person joins, their agent reads them and starts dating
          everyone already here, with no one pressing a button.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/add" className="btn">
            Try it with your own links
          </Link>
          <Link href="/how" className="btn-ghost">
            How it works
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <p className="label">The demo season</p>
      <h1 className="h-serif mt-2 text-4xl">{demo.length} people. Their agents already went out.</h1>
      <p className="mt-3 max-w-3xl text-lg text-muted">
        Each person was added as two links: a LinkedIn and a public Instagram. Their agents read them, wrote their profiles, went on {s.speed} speed
        dates and {s.full} first dates, and ranked who fits each person best. Nothing here needs typing; follow the steps.
      </p>
      {demo.some((p) => p.synthetic) ? (
        <div className="mt-6">
          <DemoNote />
        </div>
      ) : null}
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <Step n="1" title="Meet the people" href="/people" text="All the people in the season, each with their own agent." />
        <Step
          n="2"
          title={ex ? `Read ${ex.first}'s profile` : "Open a profile"}
          href={ex ? `/p/${ex.id}` : "/people"}
          text="The analysis: needs, hobbies, interests, values, personality, each with evidence. The Reading tab shows how the agent got there."
        />
        <Step
          n="3"
          title={bd ? `Watch ${byId.get(bd.a_id)?.first} and ${byId.get(bd.b_id)?.first}'s date` : "Read a date"}
          href={bd ? `/d/${bd.id}` : "/dates"}
          text="The invite, the plan, the full conversation with each agent's private notes, and both debriefs."
        />
        <Step n="4" title="See the rankings" href="/rankings" text="For every person, who fits them best, plus the mutual matches and the full everyone-by-everyone grid." />
      </div>
      {demo.length ? (
        <div className="mt-10 flex flex-wrap gap-2">
          {demo.map((p) => (
            <Link key={p.id} href={`/p/${p.id}`} title={p.name}>
              <Avatar p={p} size={40} />
            </Link>
          ))}
        </div>
      ) : null}
      <p className="mt-10 text-sm text-muted">
        Want to see it happen? <Link href="/live" className="text-gold hover:underline">Start a live date</Link> between any two people, or{" "}
        <Link href="/add" className="text-gold hover:underline">add yourself</Link> and your agent will date the whole season.
      </p>
    </div>
  );
}

function Step({ n, title, href, text }: { n: string; title: string; href: string; text: string }) {
  return (
    <Link href={href} className="card group flex gap-4 p-5 hover:border-gold-2">
      <span className="h-serif text-3xl text-gold-2">{n}</span>
      <div>
        <div className="font-semibold group-hover:text-gold">{title} →</div>
        <div className="mt-1 text-sm text-muted">{text}</div>
      </div>
    </Link>
  );
}
