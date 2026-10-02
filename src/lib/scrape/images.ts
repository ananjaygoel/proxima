import sharp from "sharp";
import { nanoid } from "nanoid";
import { q } from "../db";

// Social CDNs sign and expire image URLs and block hot-linking, so we keep a
// resized copy of each picture the agent looked at. The same copy is what the
// agent sees (vision) and what the profile page shows.

export async function storeRemoteImage(
  personId: string,
  url: string,
  kind: "ig_post" | "ig_avatar" | "li_avatar",
  ref: string,
  maxSide = 1024,
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0 Safari/537.36" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const out = await sharp(buf).rotate().resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer({ resolveWithObject: true });
    const id = nanoid(14);
    await q(
      `INSERT INTO images (id, person_id, kind, ref, mime, data_b64, width, height) VALUES ($1,$2,$3,$4,'image/jpeg',$5,$6,$7)`,
      [id, personId, kind, ref, out.data.toString("base64"), out.info.width, out.info.height],
    );
    return id;
  } catch {
    return null;
  }
}

export async function loadImageB64(id: string): Promise<{ mime: string; data: string } | null> {
  const rows = await q<{ mime: string; data_b64: string }>(`SELECT mime, data_b64 FROM images WHERE id = $1`, [id]);
  return rows[0] ? { mime: rows[0].mime, data: rows[0].data_b64 } : null;
}
