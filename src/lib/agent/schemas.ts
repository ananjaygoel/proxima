import { z } from "zod";

// Every structured thing an agent produces. Numeric ranges are stated in the
// descriptions and clamped after parsing (structured outputs don't enforce them).

export const CATEGORIES = [
  "career",
  "ambition",
  "value",
  "hobby",
  "interest",
  "personality",
  "lifestyle",
  "social",
  "communication",
  "need",
] as const;

export const Note = z.object({
  ref: z
    .string()
    .describe('The exact source item, using the [ref] labels given, e.g. "li:about", "li:exp:0", "li:post:2", "ig:bio", "ig:post:5".'),
  quote: z
    .string()
    .describe("A short verbatim excerpt from that item (max ~20 words). For a photo, a plain factual description of what is visible."),
  observation: z.string().describe("What this tells you about the person as a potential partner. One or two specific sentences."),
  category: z.enum(CATEGORIES),
});
export type Note = z.infer<typeof Note>;

export const LinkedInReading = z.object({
  notes: z.array(Note).describe("8-14 notes, most telling first."),
  overall: z.string().describe("Two sentences: who this person is at work and what that suggests about them outside it."),
});

export const InstagramReading = z.object({
  posts: z
    .array(
      z.object({
        ref: z.string().describe('"ig:post:<n>"'),
        what_i_see: z.string().describe("One factual sentence describing the photo itself (setting, activity, who/what is in frame). No judgments of looks."),
        signal: z.string().describe("One short phrase: what this post signals about the person's life (e.g. 'weekend trekker', 'hosts friends at home')."),
      }),
    )
    .describe("One entry per post you were shown, in order."),
  notes: z.array(Note).describe("8-14 notes across bio, captions, photos and the grid as a whole, most telling first."),
  overall: z.string().describe("Two sentences on the life this Instagram shows."),
});

const Evidence = z.array(z.string()).describe('Refs that support this, e.g. ["ig:post:3","li:about"]. At least one.');
const Confidence = z.enum(["high", "medium", "low"]);

export const Profile = z.object({
  display_name: z.string().describe("First name they go by."),
  tagline: z.string().describe("One warm, specific line that captures them (max 14 words). No clichés like 'loves to travel'."),
  summary: z.string().describe("3-4 sentences, written to a matchmaker: who they are, how they spend their time, what drives them."),
  pronouns: z.string().describe('Only if explicitly stated in either source (e.g. "she/her"); otherwise "not stated".'),
  city: z.string().describe('Where they live now, from LinkedIn location or clear Instagram evidence; "unknown" if unclear.'),
  life_stage: z.object({
    label: z.string().describe('e.g. "final-year student", "early career (2-3 yrs in)", "established founder".'),
    evidence: Evidence,
  }),
  adult: z.object({
    likely_adult: z.boolean().describe("False if anything suggests the person is under 18 (e.g. currently in school)."),
    why: z.string(),
  }),
  needs: z
    .array(
      z.object({
        need: z.string().describe("What they need from a partner or relationship, phrased concretely (e.g. 'someone who will happily do 6am hikes with them')."),
        why: z.string().describe("The reasoning from the evidence, one sentence."),
        evidence: Evidence,
        confidence: Confidence,
      }),
    )
    .describe("4-6 needs, most important first."),
  hobbies: z
    .array(z.object({ name: z.string(), detail: z.string().describe("Specific detail from the sources."), evidence: Evidence, confidence: Confidence }))
    .describe("Activities they actually do. 3-7."),
  interests: z
    .array(z.object({ name: z.string(), detail: z.string(), evidence: Evidence, confidence: Confidence }))
    .describe("Topics and worlds they care about (not the same as hobbies). 3-7."),
  values: z.array(z.object({ value: z.string(), detail: z.string(), evidence: Evidence })).describe("3-5 values their choices reveal."),
  personality: z.object({
    traits: z.array(z.object({ trait: z.string(), detail: z.string(), evidence: Evidence })).describe("4-6 traits."),
    big_five: z.object({
      openness: z.object({ score: z.number().describe("0-100"), why: z.string() }),
      conscientiousness: z.object({ score: z.number().describe("0-100"), why: z.string() }),
      extraversion: z.object({ score: z.number().describe("0-100"), why: z.string() }),
      agreeableness: z.object({ score: z.number().describe("0-100"), why: z.string() }),
      emotional_stability: z.object({ score: z.number().describe("0-100"), why: z.string() }),
    }),
    social_energy: z.string().describe("Introvert / ambivert / extrovert leaning, with the reason."),
    humor: z.string().describe("Their kind of humor, if visible; otherwise say it isn't visible."),
  }),
  lifestyle: z
    .array(z.object({ aspect: z.string().describe("e.g. weekends, fitness, food, travel, routine, nightlife, home"), observation: z.string(), evidence: Evidence }))
    .describe("3-6 aspects."),
  communication_style: z.object({ description: z.string(), evidence: Evidence }),
  career: z.object({ summary: z.string(), ambition: z.string().describe("How work fits into their life; drive vs balance."), evidence: Evidence }),
  ideal_partner: z.string().describe("2-3 sentences on who would complement them and why."),
  date_ideas: z.array(z.string()).describe("3 specific first-date ideas this person would love."),
  green_flags: z.array(z.string()).describe("3-4 things that would make them a great partner."),
  watch_outs: z.array(z.string()).describe("1-3 gentle, fair friction points a partner should know (e.g. 'travels for work most months')."),
  dealbreakers: z.array(z.object({ item: z.string(), why: z.string() })).describe("1-3 likely dealbreakers, inferred cautiously."),
  conversation_starters: z.array(z.string()).describe("3 openers grounded in specific posts or experiences."),
  unknowns: z.array(z.string()).describe("3-5 important things neither source reveals, which a real date would need to find out."),
  agent_brief: z.object({
    voice: z.string().describe("How to talk like them on a date: vocabulary, emoji use, energy, humor. Based on how they write captions/posts."),
    looking_for: z.array(z.string()).describe("3-5 things the agent should look for in a match on their behalf."),
    must_probe: z.array(z.string()).describe("2-4 questions the agent must get answered on a date (tied to needs and dealbreakers)."),
    talking_points: z.array(z.string()).describe("4-6 true, specific things about them the agent can share on dates."),
  }),
  data_quality: z.object({
    richness: Confidence.describe("How much signal the two sources gave."),
    note: z.string().describe("One sentence on what the analysis is based on and its limits."),
  }),
});
export type Profile = z.infer<typeof Profile>;

export const Invite = z.object({
  message: z.string().describe("What you say to ask them out, 1-3 sentences, referencing something on their card."),
  plan: z.object({
    place: z.string().describe("A specific kind of place, e.g. 'a tiny third-wave coffee bar with a vinyl corner'. Not a real business name."),
    area: z.string().describe("Neighbourhood or city. If you live in different cities, pick one and say why, or make it a video date."),
    activity: z.string().describe("What you'll do there."),
    time: z.string().describe("e.g. 'Saturday, 10am'"),
    why_this_fits: z.string().describe("Why this plan suits both people, from what you know."),
  }),
});
export type Invite = z.infer<typeof Invite>;

export const InviteReply = z.object({
  message: z.string().describe("Your reply, 1-2 sentences. Accept; you may suggest one small tweak that suits your person."),
  tweak: z.string().describe('The small tweak, or "" if none.'),
});

export const Scenes = z.object({
  opening: z.string().describe("2 sentences, present tense: the place, the moment they arrive and meet. Sensory, specific, no clichés."),
  midpoint: z.string().describe("1-2 sentences: the date moves on (a walk, a second stop, the activity starts)."),
  closing: z.string().describe("1-2 sentences: the date winds down, the moment of saying goodbye approaches."),
});
export type Scenes = z.infer<typeof Scenes>;

export const Turn = z.object({
  say: z.string().describe("What you say out loud. 1-3 sentences, natural spoken English, like a real date."),
  gesture: z
    .string()
    .describe('Optional stage direction, present tense, tied to the setting (e.g. "turns the menu around", "points at the heron by the lake"). Leave "" most turns; never use "smiles".'),
  private_note: z
    .string()
    .describe("Your private read, for your person only (the other agent never sees this): what you just learned and what it means for them. One sentence."),
  vibe: z.number().describe("How this is going for your person right now, from -2 (bad fit) to 2 (great fit)."),
});
export type Turn = z.infer<typeof Turn>;

export const SpeedVerdict = z.object({
  fit: z.number().describe("0-100: how good a match the other person looks for YOUR person."),
  next: z.enum(["yes", "maybe", "no"]).describe("Would you book a real date for your person?"),
  why: z.string().describe("One or two sentences, specific to what was said."),
  spark: z.string().describe('The single best moment or overlap, or "" if none.'),
  concern: z.string().describe('The biggest concern, or "" if none.'),
});
export type SpeedVerdict = z.infer<typeof SpeedVerdict>;

export const Debrief = z.object({
  scores: z.object({
    shared_interests: z.number().describe("0-10"),
    values_alignment: z.number().describe("0-10"),
    lifestyle_fit: z.number().describe("0-10"),
    conversation_chemistry: z.number().describe("0-10"),
    needs_met: z.number().describe("0-10"),
  }),
  needs_check: z
    .array(
      z.object({
        need: z.string().describe("One of your person's needs, as written in your brief."),
        verdict: z.enum(["met", "partly", "not met", "unclear"]),
        evidence: z.string().describe("What on the date showed it (quote or paraphrase)."),
      }),
    )
    .describe("Go through each of your person's needs."),
  dealbreakers_check: z.array(z.object({ dealbreaker: z.string(), triggered: z.boolean(), note: z.string() })),
  best_moment: z.object({ quote: z.string().describe("A line from the date, verbatim."), why: z.string() }),
  concern: z.string().describe('The main concern, or "" if none.'),
  second_date: z.enum(["yes", "maybe", "no"]),
  fit: z.number().describe("0-100 overall fit of the other person for your person."),
  report: z.string().describe("2-3 sentences addressed to your person by first name: how it went and your recommendation."),
});
export type Debrief = z.infer<typeof Debrief>;

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number.isFinite(n) ? n : lo)));
