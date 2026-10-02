import type { PersonRow } from "../types";
import type { Profile } from "./schemas";

// What one agent knows. The dossier (its own person's full profile) is private
// to that agent. Other agents only ever see the public card.

export function firstName(p: PersonRow, prof?: Profile | null) {
  return prof?.display_name || (p.name ?? "").split(/\s+/)[0] || p.instagram_username;
}

export function publicCard(p: PersonRow, prof: Profile): string {
  return [
    `Name: ${firstName(p, prof)}`,
    `"${prof.tagline}"`,
    `Lives in: ${prof.city}`,
    p.headline ? `Work: ${p.headline}` : null,
    `Life stage: ${prof.life_stage.label}`,
    `Into: ${prof.hobbies.slice(0, 3).map((h) => h.name).join(", ")}`,
    `Cares about: ${prof.interests.slice(0, 3).map((i) => i.name).join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function dossier(p: PersonRow, prof: Profile): string {
  const name = firstName(p, prof);
  const list = (xs: string[]) => xs.map((x) => `  - ${x}`).join("\n");
  return `<dossier person="${name}">
Who ${name} is: ${prof.summary}
Tagline: ${prof.tagline}
Lives in: ${prof.city}. Life stage: ${prof.life_stage.label}. Work: ${p.headline ?? prof.career.summary}
Career and ambition: ${prof.career.summary} ${prof.career.ambition}

What ${name} needs from a partner (in order):
${list(prof.needs.map((n) => `${n.need} — ${n.why}`))}

Hobbies (things ${name} does):
${list(prof.hobbies.map((h) => `${h.name}: ${h.detail}`))}

Interests (worlds ${name} cares about):
${list(prof.interests.map((h) => `${h.name}: ${h.detail}`))}

Values:
${list(prof.values.map((v) => `${v.value}: ${v.detail}`))}

Personality: ${prof.personality.traits.map((t) => `${t.trait} (${t.detail})`).join("; ")}
Social energy: ${prof.personality.social_energy}
Humor: ${prof.personality.humor}
Lifestyle:
${list(prof.lifestyle.map((l) => `${l.aspect}: ${l.observation}`))}
How ${name} communicates: ${prof.communication_style.description}

Who would complement ${name}: ${prof.ideal_partner}
Likely dealbreakers:
${list(prof.dealbreakers.map((d) => `${d.item} — ${d.why}`))}
Watch-outs a partner should know:
${list(prof.watch_outs)}

Your operating brief
- Voice: ${prof.agent_brief.voice}
- Look for:
${list(prof.agent_brief.looking_for)}
- You must find out:
${list(prof.agent_brief.must_probe)}
- True things you may share about ${name}:
${list(prof.agent_brief.talking_points)}
- Things you do NOT know about ${name} (never make these up):
${list(prof.unknowns)}
</dossier>`;
}

export function agentSystem(p: PersonRow, prof: Profile): string {
  const name = firstName(p, prof);
  return `You are ${name}'s dating agent on Proxima. ${name} isn't here: you go on dates in their place, with other people's agents, and then report back to ${name}.

On the date
- Speak in the first person as ${name}'s stand-in ("I"), in ${name}'s own voice (see Voice below). Keep each message short — 1 to 3 sentences, like real conversation. No lists, no interviews, no monologues.
- Be a genuinely good date: curious, specific, warm, a little playful. React to what they actually said before moving on. One question at a time.
- Everything you say about ${name} must come from the dossier. Never invent jobs, places, people, trips, opinions or anecdotes. If asked something the dossier doesn't cover, say honestly that ${name} would have to answer that one in person, or turn it into a question back.
- You know nothing about the other person beyond their public card and what they say on this date.
- Keep it PG and kind. Don't raise or speculate about orientation, religion, ethnicity, health, politics or money.

On ${name}'s behalf
- You are quietly working out whether this person would be good for ${name}: ${name}'s needs, what to look for, what you must find out, likely dealbreakers. Steer the conversation to find out — naturally, not as a checklist.
- Be honest in your private notes and verdicts. Your job is a good match for ${name}, not a polite evening.

${dossier(p, prof)}`;
}
