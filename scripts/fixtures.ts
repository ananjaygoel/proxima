// LOCAL TESTING ONLY. Inserts fictional people (clearly marked) with
// hand-written source data so the pipeline can be exercised without
// scraping anyone. Never run against the production database.
import { nanoid } from "nanoid";
import { closePool, q } from "../src/lib/db";
import { enqueue } from "../src/lib/jobs";
import { saveSource } from "../src/lib/repo";
import type { InstagramData, LinkedInData } from "../src/lib/types";

const FIX = [
  { name: "Test Asha", head: "Product designer at a fintech", city: "Bengaluru", about: "I design calm interfaces for money. Weekends: pottery studio and long runs.", posts: ["Glazed my first set of mugs! #pottery", "Half marathon done, 2:04 #running", "Sunday filter coffee and a sketchbook"] },
  { name: "Test Kabir", head: "Backend engineer", city: "Bengaluru", about: "Distributed systems by day, bouldering by night. Amateur baker of sourdough.", posts: ["V5 sent finally #bouldering", "Sourdough attempt #12", "Monsoon trek to Kudremukh"] },
  { name: "Test Meera", head: "Founder, climate startup", city: "Mumbai", about: "Building carbon accounting for small factories. I read too many books.", posts: ["Book club pick: The Overstory", "Pitch day nerves", "Sunset at Carter Road with friends"] },
  { name: "Test Rohan", head: "Data scientist", city: "Mumbai", about: "Cricket stats nerd. Weekend tabla player. Will cook for friends.", posts: ["Tabla riyaz before work", "Hosted a biryani night for 12", "Wankhede for the T20!"] },
];

async function main() {
  for (const f of FIX) {
    const id = nanoid(10);
    const slug = f.name.toLowerCase().replace(/\s+/g, "-") + "-" + id.slice(0, 4);
    await q(`INSERT INTO people (id, cohort, status, linkedin_url, linkedin_id, instagram_url, instagram_username, consent, name, headline, city) VALUES ($1,'demo','reading',$2,$3,$4,$5,true,$6,$7,$8)`,
      [id, `https://www.linkedin.com/in/${slug}/`, slug, `https://www.instagram.com/${slug.replace(/-/g, "_")}/`, slug.replace(/-/g, "_"), f.name, f.head, f.city]);
    const li: LinkedInData = { url: "", publicId: slug, name: f.name, headline: f.head, about: f.about, location: f.city, photoUrl: null, followers: 500, connections: 500, openToWork: false,
      experience: [{ title: f.head.split(" at ")[0], company: f.head.split(" at ")[1] ?? "Startup", start: "2022", end: null }], education: [{ school: "Test University", degree: "B.Tech", end: "2020" }],
      skills: ["Testing"], certifications: [], languages: ["English", "Hindi"], volunteering: [], projects: [], publications: [], honors: [], posts: [] };
    const ig: InstagramData = { url: "", username: slug, fullName: f.name, bio: f.about.slice(0, 60), externalUrl: null, followers: 300, following: 280, postsCount: 3, verified: false, isBusiness: false, category: null, isPrivate: false, profilePicUrl: null,
      posts: f.posts.map((c, i) => ({ index: i, shortCode: null, url: null, type: "Image", caption: c, hashtags: [], mentions: [], location: null, timestamp: "2026-08-0" + (i + 1), likes: 40, comments: 3, imageUrl: null, alt: null, isPinned: false, carouselCount: 0 })) };
    await saveSource(id, "linkedin", li, "fixture");
    await saveSource(id, "instagram", ig, "fixture");
    await enqueue("read", { personId: id }, { dedupe: `read:${id}` });
    console.log("fixture", id, f.name);
  }
}
main().finally(() => closePool());
