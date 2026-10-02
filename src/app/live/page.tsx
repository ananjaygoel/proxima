import { peopleMap } from "@/lib/views";
import { LivePicker } from "./picker";

export const dynamic = "force-dynamic";
export const metadata = { title: "Watch a date" };

export default async function LivePage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const sp = await searchParams;
  const { people, profiles, byId } = await peopleMap();
  const ready = people.filter((p) => p.status === "ready" && profiles.has(p.id)).map((p) => byId.get(p.id)!);
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <h1 className="h-serif text-4xl">Watch a date, live</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Pick two people. One agent asks the other out with a plan built from both profiles, then the two agents go on the date, turn by turn, while
        you watch. Each one only knows its own person, plus whatever the other says.
      </p>
      <LivePicker people={ready} initialA={sp.a ?? null} initialB={sp.b ?? null} />
    </div>
  );
}
