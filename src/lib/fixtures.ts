// Clearly fictional people with hand-written source data, used to test the
// reading and dating without scraping anyone. Names carry "(fictional)" so
// they can never be mistaken for the real demo season, and are removed with
// removeFixtures().
import { nanoid } from "nanoid";
import { q } from "./db";
import { enqueue } from "./jobs";
import { saveSource } from "./repo";
import type { InstagramData, LinkedInData } from "./types";

type F = { name: string; head: string; city: string; about: string; exp: [string, string, string][]; edu: string; li: string[]; bio: string; ig: [string, string][] };

export const FIX: F[] = [
  {
    name: "Asha Rao (fictional)", head: "Product Designer at Paisa (fintech)", city: "Bengaluru, Karnataka, India",
    about: "I design calm interfaces for money. Before this I taught design to school kids on weekends. Outside work: a pottery studio in Indiranagar and very slow long runs.",
    exp: [["Product Designer", "Paisa", "2023 – present"], ["UX Intern", "Swiggy", "2022"]], edu: "NID Ahmedabad, B.Des 2022",
    li: ["Shipped our new savings flow. The best feedback: 'it felt like nothing happened'. That's the goal with money.", "Taught a weekend class on sketching to 12 kids. They were better at it than me."],
    bio: "clay, kms, kerning 🌿 | blr", ig: [["First set of mugs out of the kiln! Two cracked, four survived. #pottery", "studio"], ["Sunday 21k, slowest one yet and the happiest. #running", "Cubbon Park"], ["Filter coffee + sketchbook = my Saturday", "home"], ["Hosted 8 friends for a terrible-but-fun pottery night", "studio"]],
  },
  {
    name: "Kabir Mehta (fictional)", head: "Backend Engineer at Ledgerly", city: "Bengaluru, Karnataka, India",
    about: "Distributed systems by day, bouldering by night. I bake sourdough badly and keep trying. Looking for people who like long walks with no destination.",
    exp: [["Software Engineer II", "Ledgerly", "2021 – present"], ["SDE Intern", "Flipkart", "2020"]], edu: "IIT Madras, B.Tech CS 2021",
    li: ["We cut p99 latency by 40% by deleting code. Best PR of my life.", "Mentoring two juniors this quarter. Teaching makes you find the holes in your own understanding."],
    bio: "boulders, bread, bugs", ig: [["V5 finally sent after 3 weeks of falling off it #bouldering", "Boulder Box"], ["Sourdough attempt #12. It's edible.", "home"], ["Monsoon trek to Kudremukh, soaked and happy", "Kudremukh"], ["Board game night, I lost at Catan again", "friend's place"]],
  },
  {
    name: "Meera Iyer (fictional)", head: "Founder, Carbonly (climate SaaS)", city: "Mumbai, Maharashtra, India",
    about: "Building carbon accounting for small factories. Ex-McKinsey. I read too many books and run a 6-person book club. I believe small boring changes beat big promises.",
    exp: [["Co-founder & CEO", "Carbonly", "2024 – present"], ["Associate", "McKinsey & Company", "2020 – 2024"]], edu: "IIM Ahmedabad, MBA 2020",
    li: ["Closed our first 20 factory customers. None of them care about 'net zero'. They care about the electricity bill. Fine by me.", "Our book club just finished The Overstory. Three of us cried."],
    bio: "📚 climate · factories · book club host", ig: [["Book club pick: The Overstory 🌳", "home"], ["Pitch day nerves, 6am chai", "Lower Parel"], ["Sunset at Carter Road with my favourite people", "Carter Road"], ["Visited a textile factory in Bhiwandi, loved every minute", "Bhiwandi"]],
  },
  {
    name: "Rohan Desai (fictional)", head: "Data Scientist at CricViz India", city: "Mumbai, Maharashtra, India",
    about: "Cricket stats nerd. Weekend tabla player (8 years and counting). Will cook for friends if you bring dessert.",
    exp: [["Data Scientist", "CricViz India", "2022 – present"], ["Analyst", "Fractal", "2019 – 2022"]], edu: "IIT Bombay, M.Sc Statistics 2019",
    li: ["Built a model that predicts when a batter is about to get out. It's right 61% of the time, which is humbling.", "Talk at PyData Mumbai on cricket win-probability."],
    bio: "numbers 🏏 tabla 🥁 biryani 🍛", ig: [["Tabla riyaz before work, 6:30am", "home"], ["Hosted a biryani night for 12, zero leftovers", "home"], ["Wankhede for the T20! Called the result at over 14", "Wankhede"], ["Gig with my tabla teacher's group", "NCPA"]],
  },
];

export async function insertFixtures(cohort: "demo" | "guest", count = FIX.length) {
  const ids: string[] = [];
  for (const f of FIX.slice(0, count)) {
    const id = nanoid(10);
    const slug = f.name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-+$/, "") + "-" + id.slice(0, 4).toLowerCase();
    const handle = slug.replace(/-/g, "_").slice(0, 28);
    await q(
      `INSERT INTO people (id, cohort, status, stage_detail, linkedin_url, linkedin_id, instagram_url, instagram_username, consent, name, headline, city) VALUES ($1,$2,'reading','Reading LinkedIn and Instagram',$3,$4,$5,$6,true,$7,$8,$9)`,
      [id, cohort, `https://www.linkedin.com/in/${slug}/`, slug, `https://www.instagram.com/${handle}/`, handle, f.name, f.head, f.city],
    );
    const li: LinkedInData = {
      url: "", publicId: slug, name: f.name, headline: f.head, about: f.about, location: f.city, photoUrl: null, followers: 600, connections: 500, openToWork: false,
      experience: f.exp.map(([title, company, when]) => ({ title, company, start: when.split(" – ")[0], end: when.split(" – ")[1] ?? when })),
      education: [{ school: f.edu.split(",")[0], degree: f.edu.split(",")[1]?.trim() ?? null }],
      skills: [], certifications: [], languages: ["English", "Hindi"], volunteering: [], projects: [], publications: [], honors: [],
      posts: f.li.map((text, i) => ({ text, date: `2026-0${8 - i}-10` })),
    };
    const ig: InstagramData = {
      url: "", username: handle, fullName: f.name, bio: f.bio, externalUrl: null, followers: 400, following: 350, postsCount: f.ig.length, verified: false, isBusiness: false, category: null, isPrivate: false, profilePicUrl: null,
      posts: f.ig.map(([caption, location], i) => ({ index: i, shortCode: null, url: null, type: "Image", caption, hashtags: [], mentions: [], location, timestamp: `2026-09-0${i + 1}`, likes: 60, comments: 4, imageUrl: null, alt: null, isPinned: false, carouselCount: 0 })),
    };
    await saveSource(id, "linkedin", li, "fixture");
    await saveSource(id, "instagram", ig, "fixture");
    await enqueue("read", { personId: id }, { dedupe: `read:${id}` });
    ids.push(id);
  }
  return ids;
}

export async function removeFixtures() {
  const gone = await q<{ id: string }>(`DELETE FROM people WHERE name LIKE '%(fictional)%' RETURNING id`);
  await q(`DELETE FROM jobs WHERE payload ? 'personId' AND NOT EXISTS (SELECT 1 FROM people p WHERE p.id = jobs.payload->>'personId')`);
  await q(`DELETE FROM jobs WHERE payload ? 'dateId' AND NOT EXISTS (SELECT 1 FROM dates d WHERE d.id = jobs.payload->>'dateId')`);
  return gone.length;
}
