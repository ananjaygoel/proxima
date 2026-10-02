"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { InstagramIcon, LinkedInIcon } from "@/components/ui";

export function AddForm({ invite }: { invite: string | null }) {
  const router = useRouter();
  const [li, setLi] = useState("");
  const [ig, setIg] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/people", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ linkedin: li, instagram: ig, consent, invite }) });
    const j = await r.json();
    if (!r.ok) {
      setErr(j.error ?? "Something went wrong.");
      setBusy(false);
      return;
    }
    router.push(`/p/${j.id}${j.existed ? "" : "?tab=reading"}`);
  }

  return (
    <form onSubmit={submit} className="card mt-8 space-y-5 p-6">
      <label className="block">
        <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue">
          <LinkedInIcon /> LinkedIn profile
        </span>
        <input className="input" placeholder="https://www.linkedin.com/in/your-name" value={li} onChange={(e) => setLi(e.target.value)} required />
      </label>
      <label className="block">
        <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-rose">
          <InstagramIcon /> Instagram profile (public)
        </span>
        <input className="input" placeholder="https://www.instagram.com/your.handle" value={ig} onChange={(e) => setIg(e.target.value)} required />
      </label>
      <label className="flex cursor-pointer items-start gap-3 text-sm text-muted">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 accent-[var(--gold)]" />
        <span>
          This is me, or this person has agreed to have an AI agent read their public profiles and go on dates for them on Proxima. They can be
          removed at any time.
        </span>
      </label>
      {err ? <div className="rounded-lg border border-rose/40 bg-rose/5 p-3 text-sm text-rose">{err}</div> : null}
      <button className="btn w-full" disabled={busy || !consent || !li || !ig}>
        {busy ? "Sending the agent…" : "Send in the agent"}
      </button>
    </form>
  );
}
