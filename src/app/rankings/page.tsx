import { rankingsView } from "@/lib/views";
import { RankingsBoard } from "./board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rankings" };

export default async function RankingsPage({ searchParams }: { searchParams: Promise<{ p?: string; view?: string }> }) {
  const sp = await searchParams;
  const v = await rankingsView();
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="h-serif text-4xl">Rankings</h1>
      <p className="mt-1 max-w-3xl text-muted">
        For every person, who fits them best, after their agent dated everyone. Score = 65% their own agent&apos;s verdict + 35% the other agent&apos;s
        verdict on them, taken from the most in-depth date the two had (a full date beats a speed date).
      </p>
      <RankingsBoard people={v.people} ranks={v.ranks} initial={sp.p ?? null} initialView={sp.view === "matrix" ? "matrix" : sp.view === "mutual" ? "mutual" : "person"} />
    </div>
  );
}
