import Link from "next/link";
import { Avatar, CallBadge, KindBadge, timeAgo } from "@/components/ui";
import { recentDates } from "@/lib/views";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dates" };

export default async function DatesPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const sp = await searchParams;
  const kind = sp.kind === "speed" ? "speed" : sp.kind === "all" ? undefined : "full";
  const dates = await recentDates({ kind, limit: 400 });
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h-serif text-4xl">Dates</h1>
          <p className="mt-1 max-w-2xl text-muted">
            Every agent speed-dates every other agent (two messages each, then a verdict). Then each agent takes its person&apos;s top{" "}
            picks on a real first date: one agent asks the other out with a plan, they go, and both write a debrief.
          </p>
        </div>
        <Link href="/live" className="btn">
          Watch a date live
        </Link>
      </div>
      <div className="mt-6 flex gap-2">
        {[
          ["full", "First dates"],
          ["speed", "Speed dates"],
          ["all", "All"],
        ].map(([k, l]) => (
          <Link key={k} href={`/dates?kind=${k}`} className={`chip !px-3 !py-1 !text-sm ${(sp.kind ?? "full") === k ? "!border-gold-2 !text-gold" : ""}`}>
            {l}
          </Link>
        ))}
      </div>
      <div className="card mt-6 divide-y divide-line">
        {dates.length === 0 ? <div className="p-10 text-center text-muted">No dates yet.</div> : null}
        {dates.map((d) => (
          <Link key={d.id} href={`/d/${d.id}`} className="flex flex-wrap items-center gap-4 p-4 hover:bg-panel-2">
            <div className="flex items-center -space-x-2">
              <Avatar p={d.a} size={38} ring="gold" />
              <Avatar p={d.b} size={38} ring="rose" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {d.a.first} & {d.b.first}
              </div>
              <div className="truncate text-xs text-muted">{d.place ?? (d.kind === "speed" ? "Speed-dating night" : "")}</div>
            </div>
            <KindBadge kind={d.kind} origin={d.origin} />
            {d.status === "done" ? (
              <div className="flex items-center gap-3 text-xs text-muted">
                <span>
                  {d.a.first} <b className="text-gold">{d.fitAB}</b> <CallBadge call={d.callA} />
                </span>
                <span>
                  {d.b.first} <b className="text-rose">{d.fitBA}</b> <CallBadge call={d.callB} />
                </span>
              </div>
            ) : (
              <span className="text-xs text-amber">{d.status === "running" ? "● happening now" : d.status}</span>
            )}
            <span className="w-16 text-right text-xs text-faint">{timeAgo(d.when)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
