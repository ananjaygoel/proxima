import Link from "next/link";
import type { PersonLite } from "@/lib/views";

export function Avatar({ p, size = 40, ring }: { p: Pick<PersonLite, "photo" | "first" | "name">; size?: number; ring?: "gold" | "rose" }) {
  const style = { width: size, height: size };
  const ringCls = ring === "gold" ? "ring-2 ring-gold/70" : ring === "rose" ? "ring-2 ring-rose/70" : "ring-1 ring-line-2";
  if (p.photo)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/img/${p.photo}`} alt={p.name} style={style} className={`shrink-0 rounded-full object-cover ${ringCls}`} />;
  return (
    <div style={style} className={`flex shrink-0 items-center justify-center rounded-full bg-panel-2 text-sm font-semibold text-gold ${ringCls}`}>
      {(p.first || p.name || "?").slice(0, 1).toUpperCase()}
    </div>
  );
}

export function PersonLink({ p, size = 32, sub }: { p: PersonLite; size?: number; sub?: string | null }) {
  return (
    <Link href={`/p/${p.id}`} className="group flex min-w-0 items-center gap-2.5">
      <Avatar p={p} size={size} />
      <span className="min-w-0">
        <span className="block truncate font-medium group-hover:text-gold">{p.name}</span>
        {sub ? <span className="block truncate text-xs text-muted">{sub}</span> : null}
      </span>
    </Link>
  );
}

export function LinkedInIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

export function InstagramIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
    </svg>
  );
}

export function refLabel(ref: string): { src: "linkedin" | "instagram" | "other"; label: string } {
  const [s, kind, n] = ref.split(":");
  const num = n != null && n !== "" ? ` ${Number(n) + 1}` : "";
  if (s === "li") {
    const names: Record<string, string> = {
      name: "Name", headline: "Headline", location: "Location", about: "About", exp: "Experience", edu: "Education", skills: "Skills",
      certs: "Certifications", languages: "Languages", vol: "Volunteering", proj: "Project", pub: "Publication", honor: "Honor", post: "Post", network: "Network", open_to_work: "Open to work",
    };
    return { src: "linkedin", label: `${names[kind] ?? kind}${num}` };
  }
  if (s === "ig") {
    const names: Record<string, string> = { bio: "Bio", post: "Post", stats: "Stats", handle: "Handle", link: "Link", grid: "Grid" };
    return { src: "instagram", label: `${names[kind] ?? kind}${num}` };
  }
  return { src: "other", label: ref };
}

export function anchorFor(ref: string) {
  return `ref-${ref.replace(/:/g, "-")}`;
}

export function EvidenceChip({ refId, personId, thumb }: { refId: string; personId: string; thumb?: string | null }) {
  const { src, label } = refLabel(refId);
  return (
    <Link
      href={`/p/${personId}?tab=sources#${anchorFor(refId)}`}
      className={`chip !gap-1.5 !px-2 !py-0.5 hover:!border-gold-2 hover:!text-gold ${src === "instagram" ? "!text-rose/90" : src === "linkedin" ? "!text-blue/90" : ""}`}
      title={`Evidence: ${refId}`}
    >
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/img/${thumb}`} alt="" className="h-4 w-4 rounded-[3px] object-cover" />
      ) : src === "instagram" ? (
        <InstagramIcon size={11} />
      ) : src === "linkedin" ? (
        <LinkedInIcon size={11} />
      ) : null}
      <span className="text-[11px]">{label}</span>
    </Link>
  );
}

export function ConfidenceDot({ c }: { c: "high" | "medium" | "low" }) {
  const color = c === "high" ? "bg-green" : c === "medium" ? "bg-amber" : "bg-faint";
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-faint" title={`${c} confidence`}>
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      {c}
    </span>
  );
}

export const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  scraping: "Fetching profiles",
  reading: "Agent is reading",
  profile: "Profile ready",
  dating: "Out dating",
  ranked: "Ranked",
  error: "Needs attention",
  excluded: "Excluded",
};

export function StatusPill({ status }: { status: string }) {
  const settled = ["profile", "ranked", "error", "excluded"].includes(status);
  const color =
    status === "ranked" || status === "profile"
      ? "text-green border-green/40"
      : status === "error"
        ? "text-rose border-rose/40"
        : status === "excluded"
          ? "text-faint"
          : "text-amber border-amber/40";
  return (
    <span className={`chip ${color}`}>
      {settled ? null : <Dot />}
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function Dot() {
  return <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber" />;
}

export function ScoreRing({ value, size = 56, label, color = "var(--gold)" }: { value: number | null; size?: number; label?: string; color?: string }) {
  const v = value ?? 0;
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} title={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth="4" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="4" fill="none" strokeDasharray={`${(v / 100) * c} ${c}`} strokeLinecap="round" />
      </svg>
      <span className="absolute text-sm font-semibold tabular-nums" style={{ fontSize: size * 0.27 }}>
        {value == null ? "–" : v}
      </span>
    </div>
  );
}

export function Bar({ value, max = 100, color = "var(--gold)" }: { value: number; max?: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div className="h-full rounded-full" style={{ width: `${Math.max(2, (value / max) * 100)}%`, background: color }} />
    </div>
  );
}

export function CallBadge({ call }: { call: string | null }) {
  if (!call) return null;
  const map: Record<string, string> = { yes: "text-green border-green/40", maybe: "text-amber border-amber/40", no: "text-rose border-rose/40" };
  const text: Record<string, string> = { yes: "Yes", maybe: "Maybe", no: "No" };
  return <span className={`chip !px-2 !py-0 ${map[call] ?? ""}`}>{text[call] ?? call}</span>;
}

export function KindBadge({ kind, origin }: { kind: "speed" | "full"; origin?: string }) {
  return (
    <span className={`chip !px-2 !py-0 ${kind === "full" ? "!border-rose/40 !text-rose" : ""}`}>
      {kind === "full" ? "Full date" : "Speed date"}
      {origin === "live" ? " · live" : ""}
    </span>
  );
}

export function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h3 className="h-serif text-xl text-gold">{children}</h3>
      {sub ? <p className="mt-0.5 text-sm text-muted">{sub}</p> : null}
    </div>
  );
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
