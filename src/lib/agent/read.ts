import type Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { q } from "../db";
import { imageBlock, structured } from "../llm";
import { loadImageB64 } from "../scrape/images";
import type { InstagramData, LinkedInData } from "../types";
import { InstagramReading, LinkedInReading, Profile, type Note } from "./schemas";

// The reading: three passes.
//   1. LinkedIn pass  (text)            -> evidence notes
//   2. Instagram pass (captions + photos, vision) -> per-photo descriptions + notes
//   3. Synthesis      (notes + facts)   -> the profile: needs, hobbies, interests...
// Passes 1 and 2 run in parallel; their notes are written to the database as
// soon as each pass lands, so the profile page can show the reading live.

const SENSITIVE_RULE = `Never infer, guess or mention: sexual orientation, religion or caste, ethnicity or race, health or disability, political views, income or wealth. Never rate looks or comment on bodies. If a source states something in these areas, leave it out anyway.`;

const READER_SYSTEM = `You are the reading agent of Proxima, an agentic dating service. Before a person's agent can date on their behalf, you read the only two sources Proxima is allowed to use — the person's public LinkedIn and their public Instagram — and work out who they are as a potential partner.

How to read:
- Read like a perceptive, kind matchmaker, not a recruiter. Look past titles to how they live: what fills their weekends, who they spend time with, what they make, what they keep coming back to, how they write.
- Every note must point to one specific item through its [ref] label and quote or describe it. No generic claims ("loves travel") without the specific evidence ("three of twelve posts are mountain treks; ig:post:4 caption: '4th summit this year'").
- Repetition is signal. So are contrasts between the professional and the personal self, and what is conspicuously absent.
- Keep "quote" factual; put interpretation in "observation".
- If a source is thin, write fewer notes rather than padding.

${SENSITIVE_RULE}`;

const PROFILER_SYSTEM = `You are the profiling agent of Proxima, an agentic dating service. You turn the reading notes taken from a person's public LinkedIn and public Instagram into their dating profile. That profile is shown on their profile page and becomes the private brief of the agent that will go on dates on their behalf.

Rules:
- Ground every claim in the notes and cite refs in each evidence array (e.g. "ig:post:3", "li:exp:0"). When evidence is thin, say so, lower confidence, and don't pad.
- Needs = what this person needs from a partner or relationship, derived from how they actually live. Be concrete. "Someone who'll be at the 6am trailhead, or who's genuinely happy to let them go" beats "an adventurous partner".
- Hobbies are things they do; interests are topics and worlds they care about. Don't repeat items across the two.
- Big Five scores are estimates from observable behaviour; stay within 25-75 unless the evidence is strong.
- Write warmly and specifically, like a matchmaker who has done their homework. No clichés, no flattery, no horoscopes.
- The agent_brief is operating instructions for the dating agent: how to sound like this person, what to look for, what to probe, and true things it may share.
- Only mark likely_adult false if something suggests they are under 18.

${SENSITIVE_RULE}`;

// ---------- source renderers (the [ref] labels the agents cite) ----------

export function renderLinkedIn(li: LinkedInData): string {
  const lines: string[] = [];
  lines.push(`[li:name] ${li.name}`);
  if (li.headline) lines.push(`[li:headline] ${li.headline}`);
  if (li.location) lines.push(`[li:location] ${li.location}`);
  if (li.followers != null || li.connections != null) lines.push(`[li:network] followers: ${li.followers ?? "?"}, connections: ${li.connections ?? "?"}`);
  if (li.openToWork) lines.push(`[li:open_to_work] yes`);
  if (li.about) lines.push(`[li:about] ${li.about}`);
  li.experience.forEach((e, i) =>
    lines.push(
      `[li:exp:${i}] ${e.title} at ${e.company}${e.start || e.end ? ` (${e.start ?? "?"} – ${e.end ?? "present"}${e.duration ? `, ${e.duration}` : ""})` : ""}${e.location ? `, ${e.location}` : ""}${e.employmentType ? ` [${e.employmentType}]` : ""}${e.description ? `\n    ${e.description.slice(0, 900)}` : ""}`,
    ),
  );
  li.education.forEach((e, i) =>
    lines.push(`[li:edu:${i}] ${e.school}${e.degree ? ` — ${e.degree}` : ""}${e.field ? `, ${e.field}` : ""}${e.start || e.end ? ` (${e.start ?? "?"} – ${e.end ?? "?"})` : ""}`),
  );
  if (li.skills.length) lines.push(`[li:skills] ${li.skills.join(", ")}`);
  if (li.certifications.length) lines.push(`[li:certs] ${li.certifications.join("; ")}`);
  if (li.languages.length) lines.push(`[li:languages] ${li.languages.join(", ")}`);
  li.volunteering.forEach((v, i) => lines.push(`[li:vol:${i}] ${v.slice(0, 400)}`));
  li.projects.forEach((v, i) => lines.push(`[li:proj:${i}] ${v.slice(0, 400)}`));
  li.publications.forEach((v, i) => lines.push(`[li:pub:${i}] ${v.slice(0, 300)}`));
  li.honors.forEach((v, i) => lines.push(`[li:honor:${i}] ${v.slice(0, 300)}`));
  li.posts.forEach((p, i) =>
    lines.push(`[li:post:${i}] ${p.date ? `(${p.date}) ` : ""}${p.likes != null ? `[${p.likes} reactions] ` : ""}${p.text.slice(0, 1200)}`),
  );
  return lines.join("\n");
}

export function renderInstagramHeader(ig: InstagramData): string {
  const lines: string[] = [];
  lines.push(`[ig:handle] @${ig.username}${ig.fullName ? ` (${ig.fullName})` : ""}${ig.verified ? " [verified]" : ""}`);
  lines.push(`[ig:bio] ${ig.bio ?? "(empty bio)"}`);
  if (ig.externalUrl) lines.push(`[ig:link] ${ig.externalUrl}`);
  lines.push(
    `[ig:stats] ${ig.postsCount ?? "?"} posts, ${ig.followers ?? "?"} followers, following ${ig.following ?? "?"}${ig.isBusiness ? `, business account${ig.category ? ` (${ig.category})` : ""}` : ""}`,
  );
  return lines.join("\n");
}

function postMeta(p: InstagramData["posts"][number]): string {
  const bits = [
    p.timestamp ? p.timestamp.slice(0, 10) : null,
    p.type,
    p.carouselCount > 1 ? `${p.carouselCount} photos (first shown)` : null,
    p.location ? `at ${p.location}` : null,
    p.likes != null ? `${p.likes} likes` : null,
    p.isPinned ? "pinned" : null,
  ].filter(Boolean);
  return `[ig:post:${p.index}] (${bits.join(", ")})\ncaption: ${p.caption ? p.caption.slice(0, 900) : "(no caption)"}${p.alt ? `\nalt text: ${p.alt.slice(0, 200)}` : ""}`;
}

// ---------- passes ----------

async function saveNotes(personId: string, source: string, notes: Note[]) {
  for (const n of notes) {
    await q(`INSERT INTO notes (person_id, source, ref, quote, observation, category) VALUES ($1,$2,$3,$4,$5,$6)`, [
      personId,
      source,
      n.ref,
      n.quote,
      n.observation,
      n.category,
    ]);
  }
}

async function readLinkedIn(personId: string, li: LinkedInData) {
  const out = await structured({
    model: config.models.read,
    purpose: "read:linkedin",
    system: READER_SYSTEM,
    effort: "medium",
    schema: LinkedInReading,
    content: `Read this person's public LinkedIn. Cite items by their [ref] labels.\n\n<linkedin>\n${renderLinkedIn(li)}\n</linkedin>`,
  });
  await saveNotes(personId, "linkedin", out.notes);
  await q(`INSERT INTO notes (person_id, source, ref, quote, observation, category) VALUES ($1,'linkedin_overall',NULL,NULL,$2,NULL)`, [personId, out.overall]);
  return out;
}

async function readInstagram(personId: string, ig: InstagramData) {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    { type: "text", text: `Read this person's public Instagram. Cite items by their [ref] labels. Each post's photo follows its caption.\n\n<instagram>\n${renderInstagramHeader(ig)}` },
  ];
  for (const p of ig.posts) {
    content.push({ type: "text", text: postMeta(p) });
    if (p.imageId) {
      const img = await loadImageB64(p.imageId);
      if (img) content.push(imageBlock(img.mime, img.data));
    }
  }
  content.push({ type: "text", text: "</instagram>" });
  const out = await structured({
    model: config.models.read,
    purpose: "read:instagram",
    system: READER_SYSTEM,
    effort: "medium",
    schema: InstagramReading,
    content,
  });
  for (const p of out.posts) {
    await q(`INSERT INTO notes (person_id, source, ref, quote, observation, category) VALUES ($1,'instagram_photo',$2,$3,$4,NULL)`, [
      personId,
      p.ref,
      p.what_i_see,
      p.signal,
    ]);
  }
  await saveNotes(personId, "instagram", out.notes);
  await q(`INSERT INTO notes (person_id, source, ref, quote, observation, category) VALUES ($1,'instagram_overall',NULL,NULL,$2,NULL)`, [personId, out.overall]);
  return out;
}

export async function readPerson(personId: string, li: LinkedInData, ig: InstagramData, onStage?: (s: string) => Promise<void>) {
  await q(`DELETE FROM notes WHERE person_id=$1`, [personId]);
  await onStage?.("Reading LinkedIn and Instagram");
  const [liR, igR] = await Promise.all([readLinkedIn(personId, li), readInstagram(personId, ig)]);
  await onStage?.("Writing the profile");

  const current = li.experience[0];
  const facts = [
    `Name: ${li.name}${ig.fullName && ig.fullName !== li.name ? ` (Instagram name: ${ig.fullName})` : ""}`,
    `LinkedIn headline: ${li.headline ?? "—"}`,
    `LinkedIn location: ${li.location ?? "—"}`,
    current ? `Current/most recent role: ${current.title} at ${current.company} (${current.start ?? "?"} – ${current.end ?? "present"})` : null,
    li.education[0] ? `Education: ${li.education.map((e) => `${e.school}${e.degree ? ` (${e.degree}${e.field ? `, ${e.field}` : ""})` : ""}${e.end ? ` ${e.end}` : ""}`).join("; ")}` : null,
    `Instagram: @${ig.username}, bio: ${ig.bio ?? "—"}, ${ig.postsCount ?? "?"} posts`,
    `LinkedIn posts available: ${li.posts.length}; Instagram posts read: ${ig.posts.length}`,
  ]
    .filter(Boolean)
    .join("\n");

  const notesText = (label: string, notes: Note[]) => notes.map((n) => `- [${n.ref}] (${n.category}) "${n.quote}" → ${n.observation}`).join("\n") + `\n(${label})`;

  const profile = await structured({
    model: config.models.read,
    purpose: "read:profile",
    system: PROFILER_SYSTEM,
    effort: "high",
    schema: Profile,
    content: `<facts>\n${facts}\n</facts>\n\n<linkedin_reading>\n${notesText(liR.overall, liR.notes)}\n</linkedin_reading>\n\n<instagram_reading>\nPhotos:\n${igR.posts
      .map((p) => `- [${p.ref}] ${p.what_i_see} → ${p.signal}`)
      .join("\n")}\n\n${notesText(igR.overall, igR.notes)}\n</instagram_reading>\n\nWrite this person's dating profile.`,
  });
  return profile;
}
