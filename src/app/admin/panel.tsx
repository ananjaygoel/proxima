"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminLogin() {
  const [key, setKey] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <h1 className="h-serif text-3xl">Admin</h1>
      <form
        className="mt-6 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) });
          if (r.ok) router.refresh();
          else setErr("Wrong key.");
        }}
      >
        <input className="input" type="password" placeholder="Admin key" value={key} onChange={(e) => setKey(e.target.value)} />
        {err ? <div className="text-sm text-rose">{err}</div> : null}
        <button className="btn w-full">Enter</button>
      </form>
    </div>
  );
}

type Props = {
  queue: { type: string; status: string; n: number }[];
  usage: { model: string; purpose: string; calls: number; input: number; output: number; cache_read: number; cache_write: number; usd: number }[];
  people: { id: string; name: string | null; cohort: string; status: string; error: string | null; linkedin_id: string; instagram_username: string }[];
  dates: { kind: string; status: string; n: number }[];
};

export function AdminPanel({ queue, usage, people, dates }: Props) {
  const router = useRouter();
  const [bulk, setBulk] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const total = usage.reduce((s, u) => s + u.usd, 0);

  async function post(url: string, body: unknown) {
    setBusy(true);
    setMsg(null);
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(JSON.stringify(j, null, 1).slice(0, 1500));
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6">
      <h1 className="h-serif text-3xl">Admin</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="label mb-2">Add the demo pool (one person per line: LinkedIn URL, then Instagram URL)</div>
          <textarea className="input h-48 font-mono text-xs" value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"https://www.linkedin.com/in/someone  https://www.instagram.com/someone"} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn" disabled={busy || !bulk.trim()} onClick={() => post("/api/people/bulk", { text: bulk, cohort: "demo" })}>
              Add to demo season
            </button>
            <button className="btn-ghost" disabled={busy} onClick={() => post("/api/admin/season", {})}>
              Run the season (speed dates → first dates)
            </button>
          </div>
          {msg ? <pre className="mt-3 max-h-60 overflow-auto rounded-lg bg-bg p-3 text-xs text-muted">{msg}</pre> : null}
        </div>
        <div className="card p-5 text-sm">
          <div className="label mb-2">Queue</div>
          <table className="w-full text-left">
            <tbody>
              {queue.map((r) => (
                <tr key={r.type + r.status} className="border-t border-line">
                  <td className="py-1">{r.type}</td>
                  <td>{r.status}</td>
                  <td className="text-right tabular-nums">{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="label mb-2 mt-5">Dates</div>
          <div className="flex flex-wrap gap-2">
            {dates.map((d) => (
              <span key={d.kind + d.status} className="chip">
                {d.kind} {d.status}: {d.n}
              </span>
            ))}
          </div>
          <div className="label mb-2 mt-5">Model spend so far: ${total.toFixed(2)}</div>
          <table className="w-full text-left text-xs">
            <tbody>
              {usage.map((u) => (
                <tr key={u.model + u.purpose} className="border-t border-line">
                  <td className="py-1">{u.purpose}</td>
                  <td>{u.calls} calls</td>
                  <td className="text-right">${u.usd.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card overflow-x-auto p-5">
        <div className="label mb-2">People ({people.length})</div>
        <table className="w-full text-left text-sm">
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="py-1.5">
                  <Link href={`/p/${p.id}`} className="hover:text-gold">
                    {p.name ?? p.linkedin_id}
                  </Link>
                </td>
                <td className="text-muted">@{p.instagram_username}</td>
                <td>{p.cohort}</td>
                <td>{p.status}</td>
                <td className="max-w-xs truncate text-xs text-rose">{p.error}</td>
                <td className="text-right">
                  {p.status === "error" ? (
                    <button className="text-xs text-gold hover:underline" onClick={() => post(`/api/people/${p.id}/retry`, {})}>
                      retry
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
