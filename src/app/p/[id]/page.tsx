import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  Avatar,
  Bar,
  CallBadge,
  ConfidenceDot,
  EvidenceChip,
  InstagramIcon,
  KindBadge,
  LinkedInIcon,
  ScoreRing,
  SectionTitle,
  StatusPill,
  anchorFor,
} from "@/components/ui";
import { personView } from "@/lib/views";
import { creatorToken, isAdmin } from "@/lib/server";
import { DeleteButton, LiveProgress, NoteLine } from "./live";
import type { Profile } from "@/lib/agent/schemas";
import type { NoteRow } from "@/lib/repo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const v = await personView((await params).id);
  return { title: v?.me.name ?? "Profile" };
}

const TABS = [
  { key: "profile", label: "Profile" },
  { key: "reading", label: "The reading" },
  { key: "sources", label: "Sources" },
  { key: "dates", label: "Dates" },
  { key: "ranking", label: "Ranking" },
] as const;

export default async function PersonPage({ params, searchParams }: Props) {
  const { id } = await params;
  const v = await personView(id);
  if (!v) notFound();
  const { person, me, profile, sources, notes, refImages, dates, ranking } = v;
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === sp.tab)?.key ?? (profile ? "profile" : "reading")) as (typeof TABS)[number]["key"];
  const token = await creatorToken();
  const canEdit = (await isAdmin()) || (!!person.creator_token && token === person.creator_token);
  const names: Record<string, string> = Object.fromEntries(dates.flatMap((d) => [[d.a.id, d.a.first], [d.b.id, d.b.first]]));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* header */}
      <div className="flex flex-col gap-6 md:flex-row md:items-center">
        <Avatar p={me} size={108} ring="gold" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="h-serif text-4xl">{me.name}</h1>
            <StatusPill status={v.display} />
            {person.cohort === "guest" ? <span className="chip">visitor</span> : null}
          </div>
          {profile ? <p className="mt-1 text-lg italic text-gold">“{profile.tagline}”</p> : null}
          <p className="mt-1 text-sm text-muted">
            {[person.headline, me.city, profile?.life_stage.label, profile && profile.pronouns !== "not stated" ? profile.pronouns : null].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={person.linkedin_url} target="_blank" rel="noreferrer" className="chip !text-blue hover:!border-blue/50">
              <LinkedInIcon /> LinkedIn ↗
            </a>
            <a href={person.instagram_url} target="_blank" rel="noreferrer" className="chip !text-rose hover:!border-rose/50">
              <InstagramIcon /> @{person.instagram_username} ↗
            </a>
          </div>
        </div>
        {ranking[0] ? (
          <Link href={`/p/${id}?tab=ranking`} className="card flex items-center gap-3 p-3 hover:border-gold-2">
            <div className="text-right">
              <div className="label">Best fit</div>
              <div className="font-semibold">{ranking[0].other.first}</div>
              <div className="text-xs text-muted">{ranking[0].mutual ? "mutual ♥" : `${ranking[0].evidence} date`}</div>
            </div>
            <Avatar p={ranking[0].other} size={44} ring="rose" />
            <ScoreRing value={ranking[0].score} size={46} />
          </Link>
        ) : null}
      </div>

      <div className="mt-6">
        <LiveProgress
          personId={id}
          initialStatus={person.status}
          refImages={refImages}
          names={names}
          showNotes={tab !== "reading"}
          canRetry={canEdit}
        />
      </div>

      {person.status === "excluded" ? (
        <div className="card mt-6 p-5 text-sm text-muted">{person.stage_detail}</div>
      ) : null}

      {/* tabs */}
      <div className="mt-8 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/p/${id}?tab=${t.key}`}
            scroll={false}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ${tab === t.key ? "border-gold text-gold" : "border-transparent text-muted hover:text-text"}`}
          >
            {t.label}
            {t.key === "dates" && dates.length ? <span className="ml-1.5 text-faint">{dates.length}</span> : null}
            {t.key === "reading" && notes.length ? <span className="ml-1.5 text-faint">{notes.filter((n) => !n.source.endsWith("_overall")).length}</span> : null}
          </Link>
        ))}
      </div>

      <div className="mt-6">
        {tab === "profile" ? profile ? <ProfileTab id={id} p={profile} refImages={refImages} /> : <Waiting what="The profile appears here as soon as the agent finishes reading." /> : null}
        {tab === "reading" ? <ReadingTab notes={notes} refImages={refImages} via={[sources.linkedinVia, sources.instagramVia]} /> : null}
        {tab === "sources" ? <SourcesTab v={v} /> : null}
        {tab === "dates" ? <DatesTab id={id} dates={dates} /> : null}
        {tab === "ranking" ? <RankingTab first={me.first} ranking={ranking} /> : null}
      </div>

      {canEdit ? (
        <div className="mt-12">
          <DeleteButton personId={id} name={me.name} />
        </div>
      ) : null}
    </div>
  );
}

function Waiting({ what }: { what: string }) {
  return <div className="card shimmer p-10 text-center text-muted">{what}</div>;
}

function Ev({ refs, id, refImages }: { refs: string[]; id: string; refImages: Record<string, string> }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {refs.slice(0, 5).map((r) => (
        <EvidenceChip key={r} refId={r} personId={id} thumb={refImages[r]} />
      ))}
    </div>
  );
}

function ProfileTab({ id, p, refImages }: { id: string; p: Profile; refImages: Record<string, string> }) {
  const b5 = p.personality.big_five;
  const big = [
    ["Openness", b5.openness],
    ["Conscientiousness", b5.conscientiousness],
    ["Extraversion", b5.extraversion],
    ["Agreeableness", b5.agreeableness],
    ["Emotional stability", b5.emotional_stability],
  ] as const;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <div className="card p-6">
          <p className="label mb-2">Who they are</p>
          <p className="text-[17px] leading-relaxed">{p.summary}</p>
        </div>

        <div className="card p-6">
          <SectionTitle sub="What this person needs from a partner, read from how they live.">Needs</SectionTitle>
          <ol className="space-y-4">
            {p.needs.map((n, i) => (
              <li key={i} className="flex gap-4">
                <span className="h-serif mt-0.5 text-2xl text-gold-2">{i + 1}</span>
                <div>
                  <div className="font-semibold">{n.need}</div>
                  <div className="text-sm text-muted">{n.why}</div>
                  <div className="flex items-center gap-3">
                    <Ev refs={n.evidence} id={id} refImages={refImages} />
                    <span className="mt-2">
                      <ConfidenceDot c={n.confidence} />
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="card p-6">
            <SectionTitle sub="Things they do.">Hobbies</SectionTitle>
            <ul className="space-y-4">
              {p.hobbies.map((h, i) => (
                <li key={i}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{h.name}</span>
                    <ConfidenceDot c={h.confidence} />
                  </div>
                  <div className="text-sm text-muted">{h.detail}</div>
                  <Ev refs={h.evidence} id={id} refImages={refImages} />
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-6">
            <SectionTitle sub="Worlds they care about.">Interests</SectionTitle>
            <ul className="space-y-4">
              {p.interests.map((h, i) => (
                <li key={i}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{h.name}</span>
                    <ConfidenceDot c={h.confidence} />
                  </div>
                  <div className="text-sm text-muted">{h.detail}</div>
                  <Ev refs={h.evidence} id={id} refImages={refImages} />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="card p-6">
            <SectionTitle>Values</SectionTitle>
            <ul className="space-y-3">
              {p.values.map((v, i) => (
                <li key={i}>
                  <div className="font-semibold">{v.value}</div>
                  <div className="text-sm text-muted">{v.detail}</div>
                  <Ev refs={v.evidence} id={id} refImages={refImages} />
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-6">
            <SectionTitle>Lifestyle</SectionTitle>
            <ul className="space-y-3">
              {p.lifestyle.map((l, i) => (
                <li key={i}>
                  <div className="label !text-gold-2">{l.aspect}</div>
                  <div className="text-sm">{l.observation}</div>
                  <Ev refs={l.evidence} id={id} refImages={refImages} />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="card p-6">
          <SectionTitle>Personality</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            {p.personality.traits.map((t, i) => (
              <div key={i}>
                <div className="font-semibold">{t.trait}</div>
                <div className="text-sm text-muted">{t.detail}</div>
                <Ev refs={t.evidence} id={id} refImages={refImages} />
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-4 border-t border-line pt-4 text-sm md:grid-cols-3">
            <div>
              <div className="label mb-1">Social energy</div>
              {p.personality.social_energy}
            </div>
            <div>
              <div className="label mb-1">Humor</div>
              {p.personality.humor}
            </div>
            <div>
              <div className="label mb-1">How they communicate</div>
              {p.communication_style.description}
            </div>
          </div>
        </div>

        <div className="card p-6">
          <SectionTitle>Work and ambition</SectionTitle>
          <p className="text-sm">{p.career.summary}</p>
          <p className="mt-2 text-sm text-muted">{p.career.ambition}</p>
          <Ev refs={p.career.evidence} id={id} refImages={refImages} />
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <ListCard title="Green flags" items={p.green_flags} color="text-green" mark="+" />
          <ListCard title="Worth knowing" items={p.watch_outs} color="text-amber" mark="~" />
          <ListCard title="Likely dealbreakers" items={p.dealbreakers.map((d) => `${d.item} (${d.why})`)} color="text-rose" mark="×" />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="card p-6">
            <SectionTitle>Who would complement them</SectionTitle>
            <p className="text-sm leading-relaxed">{p.ideal_partner}</p>
            <div className="label mb-2 mt-5">First dates they&apos;d love</div>
            <ul className="space-y-1.5 text-sm">
              {p.date_ideas.map((d, i) => (
                <li key={i}>♥ {d}</li>
              ))}
            </ul>
          </div>
          <div className="card p-6">
            <SectionTitle>Conversation starters</SectionTitle>
            <ul className="space-y-2 text-sm">
              {p.conversation_starters.map((d, i) => (
                <li key={i} className="rounded-lg bg-panel-2 px-3 py-2">
                  “{d}”
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="card border-dashed p-6">
          <SectionTitle sub="Two public profiles can't tell you everything. The agent says what it couldn't see.">What the agent couldn&apos;t tell</SectionTitle>
          <ul className="grid gap-2 text-sm text-muted md:grid-cols-2">
            {p.unknowns.map((u, i) => (
              <li key={i}>? {u}</li>
            ))}
          </ul>
        </div>
      </div>

      <aside className="space-y-6">
        <div className="card p-5">
          <p className="label mb-3">Big Five (estimated)</p>
          <div className="space-y-3">
            {big.map(([label, x]) => (
              <div key={label} title={x.why}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{label}</span>
                  <span className="tabular-nums text-muted">{Math.round(x.score)}</span>
                </div>
                <Bar value={x.score} />
                <div className="mt-1 text-xs text-faint">{x.why}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <p className="label mb-3">The agent&apos;s brief</p>
          <div className="text-sm">
            <div className="text-xs text-faint">Voice on dates</div>
            <p className="mb-3 mt-0.5">{p.agent_brief.voice}</p>
            <div className="text-xs text-faint">Looking for</div>
            <ul className="mb-3 mt-0.5 space-y-1">
              {p.agent_brief.looking_for.map((x, i) => (
                <li key={i}>· {x}</li>
              ))}
            </ul>
            <div className="text-xs text-faint">Must find out on a date</div>
            <ul className="mt-0.5 space-y-1">
              {p.agent_brief.must_probe.map((x, i) => (
                <li key={i}>? {x}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="card p-5 text-sm">
          <p className="label mb-2">Based on</p>
          <p className="text-muted">{p.data_quality.note}</p>
          <p className="mt-2 text-xs text-faint">Signal: {p.data_quality.richness}</p>
          <Link href={`/p/${id}?tab=reading`} className="mt-3 inline-block text-gold hover:underline">
            See the reading →
          </Link>
        </div>
      </aside>
    </div>
  );
}

function ListCard({ title, items, color, mark }: { title: string; items: string[]; color: string; mark: string }) {
  return (
    <div className="card p-6">
      <SectionTitle>{title}</SectionTitle>
      <ul className="space-y-2 text-sm">
        {items.map((x, i) => (
          <li key={i} className="flex gap-2">
            <span className={`${color} font-bold`}>{mark}</span>
            <span>{x}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReadingTab({ notes, refImages, via }: { notes: NoteRow[]; refImages: Record<string, string>; via: (string | null)[] }) {
  if (!notes.length) return <Waiting what="The agent's reading notes appear here, one by one, as it reads." />;
  const li = notes.filter((n) => n.source === "linkedin" || n.source === "linkedin_overall");
  const ig = notes.filter((n) => n.source === "instagram" || n.source === "instagram_overall");
  const photos = notes.filter((n) => n.source === "instagram_photo");
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted">
        Before writing anything, the agent reads both sources and takes notes. Every note points to the exact item it came from: a role, a post, a
        caption, a photo. The profile is written only from these notes.
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2 text-blue">
            <LinkedInIcon size={16} /> <span className="font-semibold">Reading LinkedIn</span>
            <span className="ml-auto text-xs text-faint">{via[0]}</span>
          </div>
          <ul className="space-y-3">
            {li.map((n) => (
              <NoteLine key={n.id} n={n} />
            ))}
          </ul>
        </div>
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2 text-rose">
            <InstagramIcon size={16} /> <span className="font-semibold">Reading Instagram</span>
            <span className="ml-auto text-xs text-faint">{via[1]}</span>
          </div>
          <ul className="space-y-3">
            {ig.map((n) => (
              <NoteLine key={n.id} n={n} thumb={n.ref ? refImages[n.ref] : undefined} />
            ))}
          </ul>
        </div>
      </div>
      {photos.length ? (
        <div className="card p-5">
          <p className="label mb-3">What the agent saw in each photo</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {photos.map((n) => (
              <div key={n.id} className="card-2 overflow-hidden">
                {n.ref && refImages[n.ref] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/img/${refImages[n.ref]}`} alt="" className="aspect-square w-full object-cover" />
                ) : null}
                <div className="p-2.5 text-xs">
                  <div className="text-muted">{n.quote}</div>
                  <div className="mt-1 text-gold">→ {n.observation}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SourcesTab({ v }: { v: NonNullable<Awaited<ReturnType<typeof personView>>> }) {
  const li = v.sources.linkedin;
  const ig = v.sources.instagram;
  const photoNotes = new Map(v.notes.filter((n) => n.source === "instagram_photo" && n.ref).map((n) => [n.ref!, n]));
  if (!li && !ig) return <Waiting what="The raw sources appear here once they're fetched." />;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card p-5">
        <div className="mb-4 flex items-center gap-2 text-blue">
          <LinkedInIcon size={16} /> <span className="font-semibold">LinkedIn, as the agent received it</span>
        </div>
        {li ? (
          <div className="space-y-4 text-sm">
            <Item refId="li:headline" title="Headline">{li.headline}</Item>
            {li.about ? <Item refId="li:about" title="About">{li.about}</Item> : null}
            {li.experience.map((e, i) => (
              <Item key={i} refId={`li:exp:${i}`} title={`${e.title} · ${e.company}`} sub={[e.start, e.end ?? "present"].filter(Boolean).join(" – ")}>
                {e.description}
              </Item>
            ))}
            {li.education.map((e, i) => (
              <Item key={i} refId={`li:edu:${i}`} title={e.school} sub={[e.degree, e.field, e.end].filter(Boolean).join(" · ")} />
            ))}
            {li.skills.length ? <Item refId="li:skills" title="Skills">{li.skills.join(", ")}</Item> : null}
            {li.languages.length ? <Item refId="li:languages" title="Languages">{li.languages.join(", ")}</Item> : null}
            {li.volunteering.map((x, i) => (
              <Item key={i} refId={`li:vol:${i}`} title="Volunteering">{x}</Item>
            ))}
            {li.posts.map((p, i) => (
              <Item key={i} refId={`li:post:${i}`} title={`Post ${i + 1}`} sub={p.date ?? undefined}>
                {p.text}
              </Item>
            ))}
          </div>
        ) : null}
      </div>
      <div className="card p-5">
        <div className="mb-4 flex items-center gap-2 text-rose">
          <InstagramIcon size={16} /> <span className="font-semibold">Instagram, as the agent received it</span>
        </div>
        {ig ? (
          <>
            <div id={anchorFor("ig:bio")} className="mb-4 scroll-mt-24 rounded-lg p-2 text-sm target:bg-gold/10">
              <div className="font-semibold">@{ig.username}</div>
              <div className="whitespace-pre-line text-muted">{ig.bio}</div>
              <div className="mt-1 text-xs text-faint">
                {ig.postsCount} posts · {ig.followers} followers · {ig.following} following
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {ig.posts.map((p) => {
                const ref = `ig:post:${p.index}`;
                const seen = photoNotes.get(ref);
                return (
                  <div key={ref} id={anchorFor(ref)} className="card-2 scroll-mt-24 overflow-hidden target:ring-2 target:ring-gold">
                    {p.imageId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/img/${p.imageId}`} alt="" className="aspect-square w-full object-cover" />
                    ) : (
                      <div className="aspect-square w-full bg-panel" />
                    )}
                    <div className="space-y-1 p-2 text-[11px]">
                      <div className="text-faint">
                        Post {p.index + 1}
                        {p.location ? ` · ${p.location}` : ""}
                        {p.timestamp ? ` · ${p.timestamp.slice(0, 10)}` : ""}
                      </div>
                      {p.caption ? <div className="line-clamp-3 text-muted">{p.caption}</div> : null}
                      {seen ? <div className="text-gold/90">Agent saw: {seen.quote}</div> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Item({ refId, title, sub, children }: { refId: string; title: React.ReactNode; sub?: string; children?: React.ReactNode }) {
  return (
    <div id={anchorFor(refId)} className="scroll-mt-24 rounded-lg p-2 target:bg-gold/10 target:ring-1 target:ring-gold-2">
      <div className="font-semibold">{title}</div>
      {sub ? <div className="text-xs text-faint">{sub}</div> : null}
      {children ? <div className="mt-1 whitespace-pre-line text-muted">{children}</div> : null}
    </div>
  );
}

function DatesTab({ id, dates }: { id: string; dates: NonNullable<Awaited<ReturnType<typeof personView>>>["dates"] }) {
  if (!dates.length) return <Waiting what="Once the profile is written, this person's agent starts dating. Dates show up here." />;
  return (
    <div className="card divide-y divide-line">
      {dates.map((d) => {
        const meA = d.a.id === id;
        const other = meA ? d.b : d.a;
        const myFit = meA ? d.fitAB : d.fitBA;
        const theirFit = meA ? d.fitBA : d.fitAB;
        return (
          <Link key={d.id} href={`/d/${d.id}`} className="flex items-center gap-4 p-4 hover:bg-panel-2">
            <Avatar p={other} size={40} />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{other.name}</div>
              <div className="truncate text-xs text-muted">{d.place ?? (d.kind === "speed" ? "Speed-dating night" : "")}</div>
            </div>
            <KindBadge kind={d.kind} origin={d.origin} />
            {d.status === "done" ? (
              <div className="hidden text-right text-xs sm:block">
                <div>
                  my agent <b className="text-gold">{myFit}</b> <CallBadge call={meA ? d.callA : d.callB} />
                </div>
                <div className="mt-1 text-muted">
                  theirs <b>{theirFit}</b> <CallBadge call={meA ? d.callB : d.callA} />
                </div>
              </div>
            ) : (
              <span className="text-xs text-amber">{d.status === "running" ? "happening now" : d.status}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

function RankingTab({ first, ranking }: { first: string; ranking: NonNullable<Awaited<ReturnType<typeof personView>>>["ranking"] }) {
  if (!ranking.length) return <Waiting what="The ranking fills in as the dates finish." />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Who fits {first} best. Score = 65% {first}&apos;s agent&apos;s verdict + 35% the other agent&apos;s verdict on {first}, from the most
        in-depth date the two had. <Link href="/how#ranking" className="text-gold hover:underline">How ranking works</Link>
      </p>
      <div className="card divide-y divide-line">
        {ranking.map((r, i) => (
          <Link key={r.otherId} href={`/d/${r.dateId}`} className="flex items-center gap-4 p-4 hover:bg-panel-2">
            <span className="h-serif w-8 text-center text-2xl text-gold-2">{i + 1}</span>
            <Avatar p={r.other} size={44} ring={r.mutual ? "rose" : undefined} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{r.other.name}</span>
                {r.mutual ? <span className="text-rose" title="Both agents said yes">♥ mutual</span> : null}
                <KindBadge kind={r.evidence} />
              </div>
              <div className="line-clamp-2 text-sm text-muted">{r.reason}</div>
            </div>
            <div className="hidden w-40 text-xs sm:block">
              <div className="mb-1 flex justify-between text-muted">
                <span>{first}&apos;s agent</span>
                <b className="text-text">{r.myFit}</b>
              </div>
              <Bar value={r.myFit} />
              <div className="mb-1 mt-2 flex justify-between text-muted">
                <span>{r.other.first}&apos;s agent</span>
                <b className="text-text">{r.theirFit}</b>
              </div>
              <Bar value={r.theirFit} color="var(--rose)" />
            </div>
            <ScoreRing value={r.score} size={52} />
          </Link>
        ))}
      </div>
    </div>
  );
}
