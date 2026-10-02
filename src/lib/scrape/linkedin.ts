import { config } from "../config";
import type { LinkedInData, LinkedInPost } from "../types";
import { runActor } from "./apify";

// LinkedIn is read through two Apify actors (no cookies, no login):
//  - harvestapi/linkedin-profile-scraper  -> profile, experience, education, skills...
//  - harvestapi/linkedin-profile-posts    -> the person's own recent posts
// Without an Apify token we fall back to the public profile page's JSON-LD,
// which LinkedIn serves to logged-out visitors for many profiles.

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const s = (v: unknown): string | null => {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    const o = v as Any;
    if (typeof o.text === "string") return o.text.trim() || null;
    if (o.year) return [o.month, o.year].filter(Boolean).join(" ");
    if (typeof o.name === "string") return o.name;
    if (typeof o.title === "string") return o.title;
  }
  return null;
};
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const arr = (v: unknown): Any[] => (Array.isArray(v) ? (v as Any[]) : []);

export function normalizeHarvestProfile(p: Any, url: string, publicId: string): LinkedInData {
  const name = [p.firstName, p.lastName].filter(Boolean).join(" ") || s(p.fullName) || s(p.name) || publicId;
  const location = s(p.location?.linkedinText) ?? s(p.location?.parsed?.text) ?? s(p.location) ?? s(p.geoLocationName);
  return {
    url,
    publicId,
    name,
    headline: s(p.headline),
    about: s(p.about) ?? s(p.summary),
    location,
    photoUrl: s(p.photo) ?? s(p.profilePicture) ?? s(p.pictureUrl),
    followers: n(p.followerCount),
    connections: n(p.connectionsCount),
    openToWork: typeof p.openToWork === "boolean" ? p.openToWork : null,
    experience: arr(p.experience).map((e) => ({
      title: s(e.position) ?? s(e.title) ?? "",
      company: s(e.companyName) ?? s(e.company) ?? "",
      start: s(e.startDate),
      end: s(e.endDate),
      duration: s(e.duration),
      location: s(e.location),
      description: s(e.description),
      employmentType: s(e.employmentType),
    })),
    education: arr(p.education).map((e) => ({
      school: s(e.schoolName) ?? s(e.school) ?? "",
      degree: s(e.degree),
      field: s(e.fieldOfStudy),
      start: s(e.startDate),
      end: s(e.endDate) ?? s(e.period),
    })),
    skills: [...new Set([...arr(p.skills).map((x) => s(x) ?? ""), ...(Array.isArray(p.topSkills) ? p.topSkills : String(p.topSkills ?? "").split("•")).map((x: unknown) => s(x) ?? "")])]
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 40),
    certifications: arr(p.certifications).map((c) => [s(c.title), s(c.issuedBy)].filter(Boolean).join(" — ")).filter(Boolean),
    languages: arr(p.languages).map((l) => [s(l.name), s(l.proficiency)].filter(Boolean).join(" (") + (l.proficiency ? ")" : "")).filter(Boolean),
    volunteering: arr(p.volunteering ?? p.volunteerExperience).map((v) => [s(v.role) ?? s(v.title), s(v.organizationName) ?? s(v.companyName), s(v.cause), s(v.description)].filter(Boolean).join(" — ")).filter(Boolean),
    projects: arr(p.projects).map((v) => [s(v.title) ?? s(v.name), s(v.description)].filter(Boolean).join(" — ")).filter(Boolean),
    publications: arr(p.publications).map((v) => [s(v.title) ?? s(v.name), s(v.publisher)].filter(Boolean).join(" — ")).filter(Boolean),
    honors: arr(p.honorsAndAwards ?? p.honors).map((v) => [s(v.title), s(v.issuedBy), s(v.description)].filter(Boolean).join(" — ")).filter(Boolean),
    posts: [],
  };
}

export function normalizeHarvestPosts(items: Any[], publicId: string): LinkedInPost[] {
  return items
    .filter((it) => {
      const author = (it.author?.publicIdentifier ?? it.author?.linkedinUrl ?? "") as string;
      return !author || author.toLowerCase().includes(publicId.toLowerCase());
    })
    .map((it) => ({
      text: (s(it.content) ?? s(it.text) ?? s(it.commentary) ?? "").slice(0, 1500),
      date: s(it.postedAt?.date) ?? s(it.postedAt) ?? s(it.postedDate),
      likes: n(it.engagement?.likes) ?? n(it.numLikes),
      comments: n(it.engagement?.comments) ?? n(it.numComments),
      isRepost: Boolean(it.repostedBy || it.isRepost),
    }))
    .filter((p) => p.text.length > 0)
    .slice(0, 10);
}

async function viaApify(url: string, publicId: string): Promise<LinkedInData> {
  const [profiles, posts] = await Promise.all([
    runActor<Any>("harvestapi/linkedin-profile-scraper", {
      profileScraperMode: "Profile details no email ($4 per 1k)",
      queries: [url],
    }),
    runActor<Any>("harvestapi/linkedin-profile-posts", {
      targetUrls: [url],
      maxPosts: 10,
      includeReposts: false,
      includeQuotePosts: true,
      scrapeReactions: false,
      scrapeComments: false,
    }).catch(() => [] as Any[]), // posts are a bonus; never fail the person on them
  ]);
  const p = profiles.find((x) => !x.error) ?? null;
  if (!p) {
    const err = profiles[0]?.error ?? profiles[0]?.message;
    throw new Error(err ? `LinkedIn: ${String(err)}` : "LinkedIn profile could not be read (is the link public?).");
  }
  const data = normalizeHarvestProfile(p, url, publicId);
  data.posts = normalizeHarvestPosts(posts, publicId);
  return data;
}

async function viaPublicPage(url: string, publicId: string): Promise<LinkedInData> {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  const html = await res.text();
  if (!res.ok || /authwall|uas\/login/i.test(res.url)) {
    throw new Error(`LinkedIn public page unavailable (${res.status}); set APIFY_TOKEN for reliable reads.`);
  }
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => {
    try {
      return JSON.parse(m[1]);
    } catch {
      return null;
    }
  });
  const graph: Any[] = blocks.flatMap((b) => (b?.["@graph"] ? b["@graph"] : b ? [b] : []));
  const person = graph.find((g) => g?.["@type"] === "Person");
  if (!person) throw new Error("LinkedIn public page had no profile data; set APIFY_TOKEN.");
  const meta = (name: string) => html.match(new RegExp(`<meta[^>]+(?:name|property)="${name}"[^>]+content="([^"]*)"`, "i"))?.[1] ?? null;
  const posts = graph
    .filter((g) => g?.["@type"] === "SocialMediaPosting" || g?.["@type"] === "Article")
    .map((g) => ({ text: String(g.articleBody ?? g.headline ?? "").slice(0, 1500), date: g.datePublished ?? null }))
    .filter((p) => p.text);
  return {
    url,
    publicId,
    name: person.name ?? publicId,
    headline: meta("og:title")?.split(" - ").slice(1).join(" - ") || (Array.isArray(person.jobTitle) ? person.jobTitle.join(", ") : person.jobTitle) || null,
    about: person.description ?? meta("description"),
    location: person.address?.addressLocality ?? null,
    photoUrl: typeof person.image === "string" ? person.image : person.image?.contentUrl ?? null,
    followers: person.interactionStatistic?.userInteractionCount ?? null,
    connections: null,
    openToWork: null,
    experience: (Array.isArray(person.worksFor) ? person.worksFor : []).map((w: Any) => ({
      title: w.member?.description ?? "",
      company: w.name ?? "",
      start: w.member?.startDate ?? null,
      end: w.member?.endDate ?? null,
      description: w.member?.description ?? null,
    })),
    education: (Array.isArray(person.alumniOf) ? person.alumniOf : []).map((e: Any) => ({
      school: e.name ?? "",
      start: e.member?.startDate ?? null,
      end: e.member?.endDate ?? null,
    })),
    skills: [],
    certifications: [],
    languages: (Array.isArray(person.knowsLanguage) ? person.knowsLanguage : []).map((l: Any) => l.name ?? String(l)),
    volunteering: [],
    projects: [],
    publications: [],
    honors: (Array.isArray(person.awards) ? person.awards : []).map(String),
    posts,
  };
}

export async function fetchLinkedIn(url: string, publicId: string): Promise<{ data: LinkedInData; via: string }> {
  if (config.apifyToken) {
    return { data: await viaApify(url, publicId), via: "apify:harvestapi/linkedin-profile-scraper+posts" };
  }
  return { data: await viaPublicPage(url, publicId), via: "linkedin-public-page-jsonld" };
}
