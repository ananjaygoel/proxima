"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/ui";
import type { PersonLite } from "@/lib/views";

export function LivePicker({ people, initialA, initialB }: { people: PersonLite[]; initialA: string | null; initialB: string | null }) {
  const router = useRouter();
  const [a, setA] = useState<string | null>(initialA);
  const [b, setB] = useState<string | null>(initialB);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const random = () => {
    if (people.length < 2) return;
    const i = Math.floor(Math.random() * people.length);
    let j = Math.floor(Math.random() * (people.length - 1));
    if (j >= i) j++;
    setA(people[i].id);
    setB(people[j].id);
  };

  async function go() {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/dates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a, b }) });
    const j = await r.json();
    if (!r.ok) {
      setErr(j.error ?? "Couldn't start the date.");
      setBusy(false);
      return;
    }
    router.push(`/d/${j.id}`);
  }

  if (people.length < 2) return <div className="card mt-8 p-8 text-center text-muted">At least two people need finished profiles first.</div>;

  return (
    <div className="mt-8 space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Column title="Who asks" people={people} value={a} onChange={setA} disabled={b} ring="gold" />
        <Column title="Who gets asked" people={people} value={b} onChange={setB} disabled={a} ring="rose" />
      </div>
      {err ? <div className="rounded-lg border border-rose/40 p-3 text-sm text-rose">{err}</div> : null}
      <div className="flex flex-wrap gap-3">
        <button className="btn" disabled={!a || !b || a === b || busy} onClick={go}>
          {busy ? "Booking the table…" : "Send them on a date"}
        </button>
        <button className="btn-ghost" onClick={random}>
          Random pair
        </button>
      </div>
    </div>
  );
}

function Column({
  title,
  people,
  value,
  onChange,
  disabled,
  ring,
}: {
  title: string;
  people: PersonLite[];
  value: string | null;
  onChange: (v: string) => void;
  disabled: string | null;
  ring: "gold" | "rose";
}) {
  return (
    <div className="card p-3">
      <div className="label px-2 pb-2">{title}</div>
      <div className="max-h-80 overflow-y-auto scrollbar-thin">
        {people.map((p) => (
          <button
            key={p.id}
            disabled={p.id === disabled}
            onClick={() => onChange(p.id)}
            className={`flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left disabled:opacity-30 ${value === p.id ? "bg-panel-2 ring-1 ring-gold-2/50" : "hover:bg-panel-2"}`}
          >
            <Avatar p={p} size={30} ring={value === p.id ? ring : undefined} />
            <span className="min-w-0">
              <span className="block truncate text-sm">{p.name}</span>
              <span className="block truncate text-xs text-muted">{p.tagline}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
