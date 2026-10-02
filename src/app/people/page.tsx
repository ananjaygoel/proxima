import Link from "next/link";
import { Avatar, DemoNote, ScoreRing, StatusPill } from "@/components/ui";
import { roster } from "@/lib/views";

export const dynamic = "force-dynamic";
export const metadata = { title: "People" };

export default async function PeoplePage() {
  const people = await roster();
  const demo = people.filter((p) => p.cohort === "demo");
  const guests = people.filter((p) => p.cohort === "guest");
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h-serif text-4xl">The people</h1>
          <p className="mt-1 text-muted">
            {demo.length} people in the demo season, each represented by their own agent. Every one of them is two sources: a LinkedIn and a public Instagram.
          </p>
        </div>
        <Link href="/add" className="btn">
          Add a person
        </Link>
      </div>
      {demo.some((p) => p.synthetic) ? (
        <div className="mt-6">
          <DemoNote />
        </div>
      ) : null}
      <Grid people={demo} />
      {guests.length ? (
        <>
          <h2 className="h-serif mt-14 text-2xl">Visitors</h2>
          <p className="mt-1 text-sm text-muted">People added by visitors. Their agents date the demo season; the demo rankings stay unchanged.</p>
          <Grid people={guests} />
        </>
      ) : null}
    </div>
  );
}

function Grid({ people }: { people: Awaited<ReturnType<typeof roster>> }) {
  if (!people.length) return <div className="card mt-8 p-10 text-center text-muted">No one here yet. Add the first person.</div>;
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {people.map((p) => (
        <Link key={p.id} href={`/p/${p.id}`} className="card group flex flex-col p-5 hover:border-gold-2">
          <div className="flex items-start gap-3">
            <Avatar p={p} size={56} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold group-hover:text-gold">{p.name}</div>
              <div className="truncate text-xs text-muted">{[p.headline, p.city].filter(Boolean).join(" · ")}</div>
              <div className="mt-1.5">
                <StatusPill status={p.display} />
              </div>
            </div>
          </div>
          {p.tagline ? <p className="mt-3 line-clamp-2 text-sm italic text-gold/90">“{p.tagline}”</p> : p.stage ? <p className="mt-3 text-sm text-muted">{p.stage}</p> : null}
          {p.hobbies.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.hobbies.map((h) => (
                <span key={h} className="chip !text-[11px]">
                  {h}
                </span>
              ))}
            </div>
          ) : null}
          {p.topMatch ? (
            <div className="mt-auto flex items-center gap-2 border-t border-line pt-3 text-xs text-muted">
              <span>Best fit</span>
              <Avatar p={p.topMatch} size={22} />
              <span className="text-text">{p.topMatch.first}</span>
              {p.topMatch.mutual ? <span className="text-rose">♥</span> : null}
              <span className="ml-auto">
                <ScoreRing value={p.topMatch.score} size={30} />
              </span>
            </div>
          ) : (
            <div className="mt-auto pt-3" />
          )}
        </Link>
      ))}
    </div>
  );
}
