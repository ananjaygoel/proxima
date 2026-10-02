import sharp from "sharp";
import { nanoid } from "nanoid";
import { q } from "./db";
import { enqueue } from "./jobs";
import { saveSource } from "./repo";
import type { InstagramData, LinkedInData } from "./types";

// Simulated demo people. Their LinkedIn and Instagram content (and photos) were
// generated for the demo season; they go through exactly the same pipeline as
// real people from the reading step on, and the site labels them as fictional.

export type SyntheticPersona = {
  slug: string;
  linkedin: LinkedInData;
  instagram: InstagramData;
  avatarB64: string | null;
  postImagesB64: (string | null)[];
};

async function storeB64(personId: string, b64: string, kind: string, ref: string, maxSide: number) {
  const out = await sharp(Buffer.from(b64, "base64"))
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  const id = nanoid(14);
  await q(`INSERT INTO images (id, person_id, kind, ref, mime, data_b64, width, height) VALUES ($1,$2,$3,$4,'image/jpeg',$5,$6,$7)`, [
    id,
    personId,
    kind,
    ref,
    out.data.toString("base64"),
    out.info.width,
    out.info.height,
  ]);
  return id;
}

export async function importSynthetic(p: SyntheticPersona): Promise<{ id: string; existed: boolean }> {
  const linkedinId = `synthetic-${p.slug}`;
  const existing = await q<{ id: string }>(`SELECT id FROM people WHERE linkedin_id=$1`, [linkedinId]);
  if (existing[0]) return { id: existing[0].id, existed: true };
  const id = nanoid(10);
  const li = p.linkedin;
  const ig = p.instagram;
  await q(
    `INSERT INTO people (id, cohort, status, stage_detail, linkedin_url, linkedin_id, instagram_url, instagram_username, consent, synthetic, name, headline, city)
     VALUES ($1,'demo','reading','Reading LinkedIn and Instagram',$2,$3,$4,$5,true,true,$6,$7,$8)`,
    [id, `simulated:linkedin/${p.slug}`, linkedinId, `simulated:instagram/${ig.username}`, ig.username, li.name, li.headline, li.location],
  );
  for (let i = 0; i < ig.posts.length; i++) {
    const b64 = p.postImagesB64[i];
    ig.posts[i].imageId = b64 ? await storeB64(id, b64, "ig_post", `ig:post:${ig.posts[i].index}`, 1024) : null;
  }
  ig.profilePicImageId = p.avatarB64 ? await storeB64(id, p.avatarB64, "ig_avatar", "ig:avatar", 400) : null;
  if (ig.profilePicImageId) await q(`UPDATE people SET photo_image_id=$2 WHERE id=$1`, [id, ig.profilePicImageId]);
  await saveSource(id, "linkedin", li, "simulated (demo season)");
  await saveSource(id, "instagram", ig, "simulated (demo season)");
  await enqueue("read", { personId: id }, { dedupe: `read:${id}` });
  return { id, existed: false };
}

export async function removeSynthetic() {
  const gone = await q<{ id: string }>(`DELETE FROM people WHERE synthetic RETURNING id`);
  await q(`DELETE FROM jobs WHERE payload ? 'personId' AND NOT EXISTS (SELECT 1 FROM people p WHERE p.id = jobs.payload->>'personId')`);
  await q(`DELETE FROM jobs WHERE payload ? 'dateId' AND NOT EXISTS (SELECT 1 FROM dates d WHERE d.id = jobs.payload->>'dateId')`);
  return gone.length;
}
