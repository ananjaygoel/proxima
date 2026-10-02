import { nanoid } from "nanoid";
import { config } from "./config";
import { one, q } from "./db";
import { claim, complete, enqueue, fail, heartbeat, reschedule, PRIORITY, type Job } from "./jobs";
import { getPerson, getProfiles, getSources, pairKey, saveSource, setStatus } from "./repo";
import { readPerson } from "./agent/read";
import { hash, runDate } from "./agent/date";
import { fetchLinkedIn } from "./scrape/linkedin";
import { fetchInstagram, PrivateInstagramError } from "./scrape/instagram";
import { storeRemoteImage } from "./scrape/images";
import { rankingsFrom, loadDoneDates } from "./rank";
import type { ParsedLinks } from "./scrape/urls";

// The whole pipeline, as jobs:
//   scrape(person) -> read(person) -> [guest] plan_guest(person)
//   plan_guest: speed dates with everyone in the pool, then (when they are all
//               done) full dates with that person's top picks
//   season:     speed dates between every pair in the demo pool, then
//               plan_season_full books full dates for each person's top picks

// ---------------- people ----------------

export async function addPerson(
  links: ParsedLinks,
  opts: { cohort: "demo" | "guest"; consent: boolean; creatorToken?: string; creatorIp?: string },
): Promise<{ id: string; existed: boolean }> {
  const existing = await one<{ id: string }>(`SELECT id FROM people WHERE linkedin_id=$1`, [links.linkedinId]);
  if (existing) return { id: existing.id, existed: true };
  const id = nanoid(10);
  await q(
    `INSERT INTO people (id, cohort, status, stage_detail, linkedin_url, linkedin_id, instagram_url, instagram_username, consent, creator_token, creator_ip)
     VALUES ($1,$2,'queued','Waiting for a worker',$3,$4,$5,$6,$7,$8,$9)`,
    [id, opts.cohort, links.linkedinUrl, links.linkedinId, links.instagramUrl, links.instagramUsername, opts.consent, opts.creatorToken ?? null, opts.creatorIp ?? null],
  );
  await enqueue("scrape", { personId: id }, { dedupe: `scrape:${id}` });
  return { id, existed: false };
}

export async function retryPerson(id: string) {
  await setStatus(id, "queued", "Waiting for a worker");
  await enqueue("scrape", { personId: id }, { dedupe: `scrape:${id}` });
}

async function handleScrape(personId: string) {
  const p = await getPerson(personId);
  if (!p) return;
  await setStatus(personId, "scraping", "Fetching LinkedIn and Instagram");
  const [li, ig] = await Promise.allSettled([fetchLinkedIn(p.linkedin_url, p.linkedin_id), fetchInstagram(p.instagram_url, p.instagram_username)]);
  if (ig.status === "rejected") throw ig.reason instanceof PrivateInstagramError ? new PersonError(ig.reason.message) : ig.reason;
  if (li.status === "rejected") throw li.reason;

  await setStatus(personId, "scraping", `Saving ${ig.value.data.posts.length} Instagram posts`);
  await q(`DELETE FROM images WHERE person_id=$1`, [personId]);
  const igData = ig.value.data;
  // keep our own copy of every photo the agent will look at
  await Promise.all(
    igData.posts.map(async (post) => {
      post.imageId = post.imageUrl ? await storeRemoteImage(personId, post.imageUrl, "ig_post", `ig:post:${post.index}`) : null;
    }),
  );
  igData.profilePicImageId = igData.profilePicUrl ? await storeRemoteImage(personId, igData.profilePicUrl, "ig_avatar", "ig:avatar", 400) : null;
  const liData = li.value.data;
  const liPhoto = liData.photoUrl ? await storeRemoteImage(personId, liData.photoUrl, "li_avatar", "li:avatar", 400) : null;

  await saveSource(personId, "linkedin", liData, li.value.via);
  await saveSource(personId, "instagram", igData, ig.value.via);
  await q(`UPDATE people SET name=$2, headline=$3, city=$4, photo_image_id=$5, updated_at=now() WHERE id=$1`, [
    personId,
    liData.name || igData.fullName,
    liData.headline,
    liData.location,
    liPhoto ?? igData.profilePicImageId,
  ]);
  await setStatus(personId, "reading", "The agent is reading");
  await enqueue("read", { personId }, { dedupe: `read:${personId}` });
}

async function handleRead(personId: string) {
  const p = await getPerson(personId);
  if (!p) return;
  const src = await getSources(personId);
  if (!src.linkedin || !src.instagram) throw new PersonError("Sources missing; re-run the scrape.");
  await setStatus(personId, "reading", "Reading LinkedIn and Instagram");
  const profile = await readPerson(personId, src.linkedin, src.instagram, (s) => setStatus(personId, "reading", s));
  await q(
    `INSERT INTO profiles (person_id, data, model) VALUES ($1,$2::jsonb,$3)
     ON CONFLICT (person_id) DO UPDATE SET data=EXCLUDED.data, model=EXCLUDED.model, created_at=now()`,
    [personId, JSON.stringify(profile), config.models.read],
  );
  if (profile.city && profile.city !== "unknown") await q(`UPDATE people SET city=$2 WHERE id=$1`, [personId, profile.city]);
  if (!profile.adult.likely_adult) {
    await setStatus(personId, "excluded", "Excluded: this person may be under 18, so their agent will not date.");
    return;
  }
  await setStatus(personId, "ready", null);
  if (p.cohort === "guest") await enqueue("plan_guest", { personId }, { dedupe: `plan_guest:${personId}` });
}

// ---------------- dates ----------------

export async function createDate(kind: "speed" | "full", origin: "season" | "guest" | "live", aId: string, bId: string, priority?: number) {
  const id = nanoid(10);
  const inserted = await one<{ id: string }>(
    `INSERT INTO dates (id, kind, origin, a_id, b_id, pair_key) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (kind, pair_key) WHERE origin <> 'live' DO NOTHING RETURNING id`,
    [id, kind, origin, aId, bId, pairKey(aId, bId)],
  );
  if (!inserted) return null;
  await enqueue(kind === "speed" ? "speed_date" : "full_date", { dateId: id }, { dedupe: `date:${id}`, priority });
  return id;
}

async function readyPool(cohorts: ("demo" | "guest")[]) {
  return q<{ id: string; cohort: string }>(`SELECT id, cohort FROM people WHERE status='ready' AND cohort = ANY($1) ORDER BY created_at`, [cohorts]);
}

// Guest: speed-date everyone ready, then full dates with their top picks.
async function handlePlanGuest(job: Job) {
  const personId = job.payload.personId;
  const stage = job.payload.stage ?? "speed";
  if (stage === "speed") {
    const pool = (await readyPool(["demo", "guest"])).filter((x) => x.id !== personId);
    for (const other of pool) {
      const [a, b] = hash(pairKey(personId, other.id)) % 2 === 0 ? [personId, other.id] : [other.id, personId];
      await createDate("speed", "guest", a, b, PRIORITY.speed_date - 10);
    }
    await enqueue("plan_guest", { personId, stage: "full" }, { dedupe: `plan_guest_full:${personId}`, delaySec: 20 });
    return;
  }
  // stage === "full": wait until this person's speed dates are finished
  const pending = await one<{ n: number }>(
    `SELECT count(*)::int AS n FROM dates WHERE kind='speed' AND status IN ('queued','running') AND (a_id=$1 OR b_id=$1)`,
    [personId],
  );
  if ((pending?.n ?? 0) > 0) return "wait";
  const ranks = rankingsFrom(await loadDoneDates());
  const top = (ranks.get(personId) ?? []).filter((r) => r.evidence === "speed").slice(0, config.fullDatesPerPerson);
  for (const r of top) await createDate("full", "guest", personId, r.otherId, PRIORITY.full_date - 5);
}

export async function startSeason() {
  const pool = await readyPool(["demo"]);
  let created = 0;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const [a, b] = hash(pairKey(pool[i].id, pool[j].id)) % 2 === 0 ? [pool[i].id, pool[j].id] : [pool[j].id, pool[i].id];
      if (await createDate("speed", "season", a, b)) created++;
    }
  }
  await enqueue("plan_season_full", {}, { dedupe: "plan_season_full", delaySec: 10 });
  return { people: pool.length, speedDatesCreated: created };
}

async function handlePlanSeasonFull() {
  const pending = await one<{ n: number }>(`SELECT count(*)::int AS n FROM dates WHERE kind='speed' AND origin='season' AND status IN ('queued','running')`);
  if ((pending?.n ?? 0) > 0) return "wait";
  const demo = await readyPool(["demo"]);
  const demoIds = new Set(demo.map((d) => d.id));
  const ranks = rankingsFrom(await loadDoneDates(), (me, other) => demoIds.has(me) && demoIds.has(other));
  const chosen = new Map<string, { a: string; b: string; strength: number }>();
  for (const p of demo) {
    for (const r of (ranks.get(p.id) ?? []).slice(0, config.fullDatesPerPerson)) {
      const k = pairKey(p.id, r.otherId);
      const cur = chosen.get(k);
      // whoever is keener asks the other out
      if (!cur || r.myFit > cur.strength) chosen.set(k, { a: p.id, b: r.otherId, strength: r.myFit });
    }
  }
  for (const c of chosen.values()) await createDate("full", "season", c.a, c.b);
}

// ---------------- worker ----------------

class PersonError extends Error {}

async function handle(job: Job): Promise<"done" | "wait"> {
  switch (job.type) {
    case "scrape":
      await handleScrape(job.payload.personId);
      return "done";
    case "read":
      await handleRead(job.payload.personId);
      return "done";
    case "speed_date":
    case "full_date":
      await runDate(job.payload.dateId);
      return "done";
    case "plan_guest":
      return (await handlePlanGuest(job)) === "wait" ? "wait" : "done";
    case "plan_season_full":
      return (await handlePlanSeasonFull()) === "wait" ? "wait" : "done";
  }
}

async function onFinalFailure(job: Job, err: unknown) {
  const msg = String((err as Error)?.message ?? err).slice(0, 400);
  if (job.type === "scrape" || job.type === "read") await setStatus(job.payload.personId, "error", null, msg);
}

export async function processOne(): Promise<boolean> {
  const job = await claim();
  if (!job) return false;
  const started = Date.now();
  try {
    const r = await handle(job);
    if (r === "wait") await reschedule(job.id, 15);
    else await complete(job.id);
    log(`${job.type} #${job.id} ${r} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } catch (e) {
    // A person-level problem (private Instagram, bad link) won't fix itself on retry.
    const final = e instanceof PersonError ? await fail(job, e, 0) : await fail(job, e);
    log(`${job.type} #${job.id} error (attempt ${job.attempts}${final ? ", giving up" : ""}): ${(e as Error)?.message}`);
    if (final) await onFinalFailure(job, e);
  }
  return true;
}

export async function runWorker(opts: { budgetMs: number; concurrency: number; stopClaimingWithMs?: number; exitWhenIdle?: boolean }) {
  const deadline = Date.now() + opts.budgetMs;
  const stopClaimingAt = deadline - (opts.stopClaimingWithMs ?? 0);
  let processed = 0;
  const hb = setInterval(() => heartbeat().catch(() => {}), 5000);
  await heartbeat().catch(() => {});
  try {
    await Promise.all(
      Array.from({ length: opts.concurrency }, async () => {
        let idle = 0;
        while (Date.now() < stopClaimingAt) {
          const did = await processOne();
          if (did) {
            processed++;
            idle = 0;
          } else {
            idle++;
            if (opts.exitWhenIdle && idle >= 3) return;
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
      }),
    );
  } finally {
    clearInterval(hb);
  }
  return processed;
}

function log(s: string) {
  if (process.env.NODE_ENV !== "test") console.log(`[worker ${new Date().toISOString().slice(11, 19)}] ${s}`);
}

export async function profilesFor(ids: string[]) {
  return getProfiles(ids);
}
