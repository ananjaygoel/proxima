// Accept the official profile links people actually paste, normalise them, and
// reject everything that is not a person's LinkedIn profile / Instagram account.

export type ParsedLinks = {
  linkedinUrl: string;
  linkedinId: string;
  instagramUrl: string;
  instagramUsername: string;
};

const IG_RESERVED = new Set([
  "p", "reel", "reels", "stories", "explore", "accounts", "direct", "tv", "about", "developer", "legal", "web",
]);

export function parseLinkedIn(input: string): { url: string; id: string } {
  const raw = input.trim();
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error("That LinkedIn link doesn't look like a URL.");
  }
  if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) throw new Error("The first link has to be a linkedin.com profile.");
  const m = u.pathname.match(/^\/in\/([^/?#]+)/i);
  if (!m) throw new Error("Use a LinkedIn profile link of the form linkedin.com/in/<name>.");
  const id = decodeURIComponent(m[1]).toLowerCase();
  return { url: `https://www.linkedin.com/in/${encodeURIComponent(id)}/`, id };
}

export function parseInstagram(input: string): { url: string; username: string } {
  const raw = input.trim();
  let username = "";
  if (/^@?[A-Za-z0-9._]{1,30}$/.test(raw) && !raw.includes("instagram")) {
    username = raw.replace(/^@/, "");
  } else {
    let u: URL;
    try {
      u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      throw new Error("That Instagram link doesn't look like a URL.");
    }
    if (!/(^|\.)instagram\.com$/i.test(u.hostname)) throw new Error("The second link has to be an instagram.com profile.");
    const seg = u.pathname.split("/").filter(Boolean)[0] ?? "";
    if (!seg || IG_RESERVED.has(seg.toLowerCase())) {
      throw new Error("Use the Instagram profile link (instagram.com/<username>), not a post or reel.");
    }
    username = seg;
  }
  username = username.toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(username)) throw new Error("That Instagram username isn't valid.");
  return { url: `https://www.instagram.com/${username}/`, username };
}

export function parseLinks(linkedin: string, instagram: string): ParsedLinks {
  const li = parseLinkedIn(linkedin);
  const ig = parseInstagram(instagram);
  return { linkedinUrl: li.url, linkedinId: li.id, instagramUrl: ig.url, instagramUsername: ig.username };
}

// Bulk paste: one person per line, LinkedIn and Instagram separated by
// whitespace, comma or tab, in either order.
export function parseBulk(text: string): { ok: ParsedLinks[]; errors: { line: number; text: string; error: string }[] } {
  const ok: ParsedLinks[] = [];
  const errors: { line: number; text: string; error: string }[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return;
    const parts = t.split(/[\s,;|]+/).filter(Boolean);
    const li = parts.find((p) => /linkedin\.com/i.test(p));
    const ig = parts.find((p) => /instagram\.com/i.test(p)) ?? parts.find((p) => p !== li && /^@/.test(p));
    if (!li || !ig) {
      errors.push({ line: i + 1, text: t, error: "Need one LinkedIn and one Instagram link on the line." });
      return;
    }
    try {
      ok.push(parseLinks(li, ig));
    } catch (e) {
      errors.push({ line: i + 1, text: t, error: (e as Error).message });
    }
  });
  return { ok, errors };
}
