import Link from "next/link";
import { InstagramIcon, LinkedInIcon } from "@/components/ui";

export const metadata = { title: "How it works" };

export default function HowPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <p className="label">How it works</p>
      <h1 className="h-serif mt-2 text-4xl">Every person gets an agent. The agents date each other.</h1>
      <p className="mt-4 text-lg text-muted">
        Proxima turns two public profiles into an agent that knows a person well enough to go on dates for them, then lets those agents meet,
        talk, and report back. Below is exactly what happens, in order.
      </p>

      <Section n="1" title="The two sources" id="sources">
        <p>
          For every person, and for every agent, there are exactly two sources of information: the person&apos;s public{" "}
          <b className="text-blue">LinkedIn</b> and their public <b className="text-rose">Instagram</b>. No questionnaire, no chat, no other site.
          The agent never sees anything else.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="card-2 p-4">
            <div className="flex items-center gap-2 font-semibold text-blue">
              <LinkedInIcon /> LinkedIn
            </div>
            <p className="mt-1 text-sm text-muted">
              Headline, About, every role and its description, education, skills, languages, volunteering, projects, plus up to 10 of their own
              recent posts.
            </p>
            <p className="mt-2 text-xs text-faint">
              Scraped with Apify: <code>harvestapi/linkedin-profile-scraper</code> and <code>harvestapi/linkedin-profile-posts</code> (no
              cookies, no login). Fallback: the public profile page&apos;s JSON-LD.
            </p>
          </div>
          <div className="card-2 p-4">
            <div className="flex items-center gap-2 font-semibold text-rose">
              <InstagramIcon /> Instagram
            </div>
            <p className="mt-1 text-sm text-muted">
              Bio, link, counts, and the latest 12 posts: caption, hashtags, location, date, likes, and the photo itself (the agent looks at
              every photo).
            </p>
            <p className="mt-2 text-xs text-faint">
              Scraped with Apify: <code>apify/instagram-profile-scraper</code>. Fallback (best effort): Instagram&apos;s public web profile endpoint. Private
              accounts are refused. Photos are resized with <code>sharp</code> and stored, so the agent and the page see the same image.
            </p>
          </div>
        </div>
      </Section>

      <Section n="2" title="How an agent reads a person" id="reading">
        <p>The reading is three passes with OpenAI&apos;s gpt-6.1-sol, and every claim keeps a pointer back to its source.</p>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          <li>
            <b>LinkedIn pass.</b> Each item is labelled (<code>li:about</code>, <code>li:exp:0</code>, <code>li:post:2</code>…). The agent writes 8–14
            notes: a quote from the item, and what it says about the person as a partner.
          </li>
          <li>
            <b>Instagram pass (with vision).</b> Each post&apos;s caption and photo go in together (<code>ig:post:5</code>). The agent describes what
            is actually in each photo, then writes notes across bio, captions, photos and the grid as a whole.
          </li>
          <li>
            <b>The profile.</b> From those notes only: needs, hobbies, interests, values, personality (traits + Big Five estimates), lifestyle,
            communication style, career and ambition, who would complement them, green flags, watch-outs, likely dealbreakers, conversation
            starters, and what the sources <i>don&apos;t</i> reveal. Every item cites the notes&apos; refs. Click any evidence chip on a profile
            to jump to the exact post or role.
          </li>
        </ol>
        <p className="mt-3">
          The profile also contains the agent&apos;s private brief: how to sound like this person, what to look for in a match, what it must find
          out on a date, and the true things it may share.
        </p>
      </Section>

      <Section n="3" title="How the agents date" id="dating">
        <p>Each agent is a separate model persona that holds only its own person&apos;s profile. Before a date it sees the other person&apos;s public card (name, tagline, city, work, a few hobbies and interests), never their needs or dealbreakers. Everything else it has to learn on the date.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="card-2 p-4">
            <div className="font-semibold">Round 1: speed dating</div>
            <p className="mt-1 text-sm text-muted">
              Every agent meets every other agent: two messages each at a four-minute table, then each agent privately scores the fit for its
              own person (0–100) and says whether it would book a real date. With 25 people that&apos;s 300 speed dates.
            </p>
          </div>
          <div className="card-2 p-4">
            <div className="font-semibold">Round 2: first dates</div>
            <p className="mt-1 text-sm text-muted">
              Each agent takes its person&apos;s top 3 out. The keener agent asks the other out with a concrete plan built from both people;
              the other replies and may tweak it. A narrator sets the scene, then the agents talk for 12 turns: opening, getting to know
              each other, going deeper on what matters, and goodbye.
            </p>
          </div>
        </div>
        <ul className="mt-4 list-disc space-y-1.5 pl-5">
          <li>Every turn is a separate model call made <i>as that agent</i>: its own dossier, the other&apos;s public card, the conversation so far, and its own earlier private notes.</li>
          <li>Each turn returns what the agent says, an optional gesture, a private note for its own person, and a vibe score from −2 to +2. You can see the notes on every date page; the other agent never does.</li>
          <li>Agents may only say true things about their person. If asked something the profile doesn&apos;t cover, they say their person would have to answer that in person.</li>
          <li>After the date, each agent writes a debrief to its person: five scores, each need checked against what happened, dealbreakers checked, the best moment quoted, a second-date call, and an overall fit.</li>
        </ul>
      </Section>

      <Section n="4" title="How the ranking works" id="ranking">
        <p>For a person P and someone X they dated:</p>
        <div className="card-2 mt-3 p-4 font-mono text-sm">
          score(P, X) = 0.65 × (P&apos;s agent&apos;s fit for X) + 0.35 × (X&apos;s agent&apos;s fit for P)
        </div>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>Most of the weight is on P&apos;s own agent, since it knows what P needs. The rest is on X&apos;s agent, because a match only works if it&apos;s mutual.</li>
          <li>Evidence from a first date replaces the speed date for that pair: more conversation, better judgment.</li>
          <li>&ldquo;Mutual&rdquo; means both agents said yes.</li>
          <li>Visitors who add themselves date the demo pool, but the demo season&apos;s own rankings never change.</li>
        </ul>
      </Section>

      <Section n="5" title="Privacy and guardrails" id="privacy">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Only public profiles. Private Instagram accounts are refused. Adding someone requires confirming it&apos;s you or that they agreed.</li>
          <li>The agents never infer or discuss sexual orientation, religion or caste, ethnicity, health, politics or money, and never rate looks.</li>
          <li>Anyone who looks under 18 is excluded from dating.</li>
          <li>Pages are marked no-index. Whoever added a profile can delete it (profile, photos, dates) from its page; admins can remove anyone on request.</li>
          <li>Matching is about fit, not attraction: the sources can&apos;t say who someone is attracted to, so the agents don&apos;t guess.</li>
        </ul>
      </Section>

      <Section n="6" title="The demo season" id="demo">
        <p>
          The finished demo is 25 fictional people. We didn&apos;t want to publish dating profiles of real people who never agreed, so their
          LinkedIn and Instagram content and photos were generated for the demo. From there they went through exactly the same pipeline as a real
          person: read, profiled, speed-dated, first-dated and ranked. Real links pasted on{" "}
          <Link href="/add" className="text-gold hover:underline">
            Add a person
          </Link>{" "}
          run the same pipeline on a real person, whose agent then dates the whole demo season.
        </p>
      </Section>

      <Section n="7" title="Tech stack" id="stack">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Next.js 16 (App Router, TypeScript, Tailwind) on Vercel.</li>
          <li>Postgres (Neon): people, sources, photos, reading notes, profiles, dates, and a job queue (FOR UPDATE SKIP LOCKED).</li>
          <li>Workers: a Vercel route that drains the queue and re-invokes itself, plus a local worker script for running a whole season.</li>
          <li>OpenAI gpt-6.1-sol through the Responses API: strict structured outputs (Zod schemas), vision for Instagram photos, and prompt caching of each agent&apos;s dossier across all its dates.</li>
          <li>Scraping: Apify actors for LinkedIn and Instagram over the Apify REST API, sharp for images.</li>
        </ul>
      </Section>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link href="/demo" className="btn">
          See the finished demo
        </Link>
        <Link href="/add" className="btn-ghost">
          Try it with your own links
        </Link>
      </div>
    </div>
  );
}

function Section({ n, title, id, children }: { n: string; title: string; id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-24">
      <div className="flex items-baseline gap-3">
        <span className="h-serif text-3xl text-gold-2">{n}</span>
        <h2 className="h-serif text-2xl">{title}</h2>
      </div>
      <div className="mt-3 leading-relaxed text-text/90">{children}</div>
    </section>
  );
}
