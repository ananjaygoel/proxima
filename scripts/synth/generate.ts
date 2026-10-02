// Generates the simulated demo season: for each seed, an LLM writes the
// person's LinkedIn and Instagram content, and an image model makes their
// Instagram photos plus an illustrated avatar. Output: one JSON per person in
// scripts/_scratch/synth-out/ (git-ignored), ready for scripts/synth/upload.ts.
//
//   npm run synth:generate [-- --only=aanya-kapoor,kabir-mehta]
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import OpenAI from "openai";
import sharp from "sharp";
import { z } from "zod";
import { structured } from "../../src/lib/llm";
import { closePool } from "../../src/lib/db";
import type { InstagramData, LinkedInData } from "../../src/lib/types";
import type { SyntheticPersona } from "../../src/lib/synthetic";
import { SEEDS, type Seed } from "./seeds";

const OUT = "scripts/_scratch/synth-out";
const IMAGE_MODELS = (process.env.IMAGE_MODELS ?? "gpt-image-2,gpt-image-1.5,gpt-image-1,gpt-image-1-mini").split(",");
const openai = new OpenAI({ maxRetries: 3, timeout: 180_000 });
let imageModel: string | null = null;

const Gen = z.object({
  headline: z.string(),
  about: z.string().describe("LinkedIn About, first person, 3-5 sentences, specific, in their voice."),
  location: z.string().describe('LinkedIn style, e.g. "Bengaluru, Karnataka, India"'),
  experience: z
    .array(z.object({ title: z.string(), company: z.string(), start: z.string(), end: z.string().describe('"Present" for the current role'), description: z.string() }))
    .describe("2-4 roles, most recent first. Fictional company names only."),
  education: z.array(z.object({ school: z.string(), degree: z.string(), field: z.string(), start: z.string(), end: z.string() })),
  skills: z.array(z.string()).describe("6-12"),
  languages: z.array(z.string()),
  volunteering: z.array(z.string()).describe("0-2 entries, only if it fits"),
  linkedin_posts: z
    .array(z.object({ text: z.string().describe("A real-sounding LinkedIn post, 40-140 words, in their voice"), date: z.string().describe("YYYY-MM-DD"), likes: z.number() }))
    .describe("3-4 posts from the last 12 months"),
  instagram: z.object({
    username: z.string().describe("Plausible handle, lowercase, may use . or _"),
    bio: z.string().describe("Instagram bio, max 120 chars, their style"),
    followers: z.number(),
    following: z.number(),
    posts: z
      .array(
        z.object({
          caption: z.string().describe("Their caption: voice, emoji and hashtags only if they'd use them"),
          location: z.string().describe('A real place in India where it fits, or ""'),
          date: z.string().describe("YYYY-MM-DD"),
          likes: z.number(),
          comments: z.number(),
          image_prompt: z
            .string()
            .describe("What the photo shows, concretely (setting, objects, light, activity). If the person appears: from behind, at a distance, or only hands — never a clear face."),
        }),
      )
      .describe("Exactly 8 posts across the last 14 months, newest first"),
  }),
});

const SYSTEM = `You write realistic public social-media content for fictional people in a dating-app demo. Everything must be internally consistent (dates, cities, jobs) and specific: real Indian places and habits, concrete details, the person's own voice. Use fictional company names (never real companies). Real universities are fine. Today is ${new Date().toISOString().slice(0, 10)}.
Make the content reveal the person the way real profiles do — through routines, repeated themes, who they spend time with, how they write — without ever stating what they want in a partner. Keep it PG. No real public figures.
Friends or family named in captions must not use any of these first names (they belong to other people in the demo): ${SEEDS.map((x) => x.name.split(" ")[0]).join(", ")}.`;

function seedText(s: Seed) {
  return `Name: ${s.name} (${s.pronouns}), age ${s.age}, lives in ${s.city}.
Work: ${s.role}.
Hobbies: ${s.hobbies.join("; ")}.
Personality: ${s.vibe}.`;
}

async function image(prompt: string): Promise<string | null> {
  const models = imageModel ? [imageModel] : IMAGE_MODELS;
  for (const model of models) {
    try {
      const r = await openai.images.generate({ model, prompt, size: "1024x1024", quality: "medium", n: 1 });
      const b64 = r.data?.[0]?.b64_json;
      if (!b64) continue;
      imageModel = model;
      const jpg = await sharp(Buffer.from(b64, "base64")).resize({ width: 896, height: 896, fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
      return jpg.toString("base64");
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (!imageModel && (status === 404 || status === 400 || status === 403)) continue; // try the next model name
      console.warn(`  image failed (${model}): ${(e as Error).message.slice(0, 120)}`);
      return null;
    }
  }
  return null;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

async function one(s: Seed) {
  const file = `${OUT}/${s.slug}.json`;
  if (existsSync(file) && !process.argv.includes("--force")) {
    console.log(`skip ${s.slug} (exists)`);
    return;
  }
  const t = Date.now();
  const g = await structured({ model: "gpt-6.1-sol", purpose: "synth:persona", system: SYSTEM, effort: "medium", schema: Gen, content: seedText(s) });
  const li: LinkedInData = {
    url: "",
    publicId: s.slug,
    name: s.name,
    headline: g.headline,
    about: g.about,
    location: g.location,
    photoUrl: null,
    followers: 300 + Math.round(Math.random() * 2500),
    connections: 500,
    openToWork: false,
    experience: g.experience.map((e) => ({ title: e.title, company: e.company, start: e.start, end: e.end, description: e.description })),
    education: g.education.map((e) => ({ school: e.school, degree: e.degree, field: e.field, start: e.start, end: e.end })),
    skills: g.skills,
    certifications: [],
    languages: g.languages,
    volunteering: g.volunteering,
    projects: [],
    publications: [],
    honors: [],
    posts: g.linkedin_posts.map((p) => ({ text: p.text, date: p.date, likes: Math.round(p.likes) })),
  };
  const ig: InstagramData = {
    url: "",
    username: g.instagram.username.toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 30),
    fullName: s.name,
    bio: g.instagram.bio,
    externalUrl: null,
    followers: Math.round(g.instagram.followers),
    following: Math.round(g.instagram.following),
    postsCount: 8 + Math.round(Math.random() * 120),
    verified: false,
    isBusiness: false,
    category: null,
    isPrivate: false,
    profilePicUrl: null,
    posts: g.instagram.posts.slice(0, 8).map((p, i) => ({
      index: i,
      shortCode: null,
      url: null,
      type: "Image",
      caption: p.caption,
      hashtags: [...p.caption.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1]),
      mentions: [],
      location: p.location || null,
      timestamp: p.date,
      likes: Math.round(p.likes),
      comments: Math.round(p.comments),
      imageUrl: null,
      alt: null,
      isPinned: false,
      carouselCount: 0,
    })),
  };
  const style = "Candid smartphone photo posted on Instagram, natural light, realistic, slightly imperfect framing. No text, no logos, no watermarks.";
  const prompts = [
    `Warm editorial illustration portrait for a profile avatar: head and shoulders of a ${s.age}-year-old Indian ${s.pronouns === "she/her" ? "woman" : "man"}, ${s.look}. Soft grain, flat warm colours, plain warm background, friendly expression. Clearly an illustration, not a photo.`,
    ...g.instagram.posts.slice(0, 8).map((p) => `${style} ${p.image_prompt}${p.location ? ` Location: ${p.location}.` : ""}`),
  ];
  const imgs = await pool(prompts, 4, (p) => image(p));
  const persona: SyntheticPersona = { slug: s.slug, linkedin: li, instagram: ig, avatarB64: imgs[0], postImagesB64: imgs.slice(1) };
  writeFileSync(file, JSON.stringify(persona));
  console.log(`done ${s.slug} in ${((Date.now() - t) / 1000).toFixed(0)}s, images ${imgs.filter(Boolean).length}/${imgs.length} (${imageModel})`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const only = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1]?.split(",");
  const seeds = only ? SEEDS.filter((s) => only.includes(s.slug)) : SEEDS;
  await pool(seeds, Number(process.env.SYNTH_CONCURRENCY ?? 4), async (s) => {
    try {
      await one(s);
    } catch (e) {
      console.error(`FAILED ${s.slug}: ${(e as Error).message}`);
    }
  });
}

main().finally(() => closePool());
