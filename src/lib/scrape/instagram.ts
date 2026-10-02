import { config } from "../config";
import type { InstagramData, InstagramPost } from "../types";
import { runActor } from "./apify";

// Instagram is read with the apify/instagram-profile-scraper actor (public
// profiles only, no login). Without an Apify token we try Instagram's own
// public web endpoint, which works for logged-out web visitors but is
// rate-limited from cloud IPs.

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export class PrivateInstagramError extends Error {
  constructor(username: string) {
    super(`@${username} is a private Instagram. Only public profiles can join.`);
  }
}

const MAX_POSTS = 12;

export function normalizeApifyInstagram(p: Any, url: string, username: string): InstagramData {
  const posts: InstagramPost[] = (Array.isArray(p.latestPosts) ? p.latestPosts : []).slice(0, MAX_POSTS).map((x: Any, i: number) => ({
    index: i,
    shortCode: x.shortCode ?? null,
    url: x.url ?? (x.shortCode ? `https://www.instagram.com/p/${x.shortCode}/` : null),
    type: x.type ?? null,
    caption: typeof x.caption === "string" ? x.caption.slice(0, 1500) : null,
    hashtags: Array.isArray(x.hashtags) ? x.hashtags.slice(0, 20) : [],
    mentions: Array.isArray(x.mentions) ? x.mentions.slice(0, 20) : [],
    location: x.locationName ?? null,
    timestamp: x.timestamp ?? null,
    likes: typeof x.likesCount === "number" && x.likesCount >= 0 ? x.likesCount : null,
    comments: typeof x.commentsCount === "number" ? x.commentsCount : null,
    imageUrl: x.displayUrl ?? (Array.isArray(x.images) ? x.images[0] : null) ?? null,
    alt: x.alt ?? null,
    isPinned: Boolean(x.isPinned),
    carouselCount: Array.isArray(x.childPosts) ? x.childPosts.length : Array.isArray(x.images) ? x.images.length : 0,
  }));
  return {
    url,
    username,
    fullName: p.fullName || null,
    bio: p.biography || null,
    externalUrl: p.externalUrl || null,
    followers: p.followersCount ?? null,
    following: p.followsCount ?? null,
    postsCount: p.postsCount ?? null,
    verified: Boolean(p.verified),
    isBusiness: Boolean(p.isBusinessAccount),
    category: p.businessCategoryName || null,
    isPrivate: Boolean(p.private),
    profilePicUrl: p.profilePicUrlHD || p.profilePicUrl || null,
    posts,
  };
}

export function normalizeWebProfileInfo(u: Any, url: string, username: string): InstagramData {
  const edges: Any[] = u.edge_owner_to_timeline_media?.edges ?? [];
  return {
    url,
    username,
    fullName: u.full_name || null,
    bio: u.biography || null,
    externalUrl: u.external_url || null,
    followers: u.edge_followed_by?.count ?? null,
    following: u.edge_follow?.count ?? null,
    postsCount: u.edge_owner_to_timeline_media?.count ?? null,
    verified: Boolean(u.is_verified),
    isBusiness: Boolean(u.is_business_account),
    category: u.category_name || null,
    isPrivate: Boolean(u.is_private),
    profilePicUrl: u.profile_pic_url_hd || u.profile_pic_url || null,
    posts: edges.slice(0, MAX_POSTS).map(({ node }, i) => {
      const caption: string | null = node.edge_media_to_caption?.edges?.[0]?.node?.text ?? null;
      return {
        index: i,
        shortCode: node.shortcode ?? null,
        url: node.shortcode ? `https://www.instagram.com/p/${node.shortcode}/` : null,
        type: node.__typename === "GraphSidecar" ? "Sidecar" : node.is_video ? "Video" : "Image",
        caption: caption ? caption.slice(0, 1500) : null,
        hashtags: caption ? [...caption.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1]).slice(0, 20) : [],
        mentions: caption ? [...caption.matchAll(/@([A-Za-z0-9._]+)/g)].map((m) => m[1]).slice(0, 20) : [],
        location: node.location?.name ?? null,
        timestamp: node.taken_at_timestamp ? new Date(node.taken_at_timestamp * 1000).toISOString() : null,
        likes: node.edge_liked_by?.count ?? node.edge_media_preview_like?.count ?? null,
        comments: node.edge_media_to_comment?.count ?? null,
        imageUrl: node.display_url ?? null,
        alt: node.accessibility_caption ?? null,
        isPinned: Array.isArray(node.pinned_for_users) && node.pinned_for_users.length > 0,
        carouselCount: node.edge_sidecar_to_children?.edges?.length ?? 0,
      };
    }),
  };
}

async function viaApify(url: string, username: string): Promise<InstagramData> {
  const items = await runActor<Any>("apify/instagram-profile-scraper", { usernames: [username] });
  const p = items.find((x) => (x.username ?? "").toLowerCase() === username) ?? items[0];
  if (!p || p.error) {
    throw new Error(p?.errorDescription ?? p?.error ?? `Instagram @${username} could not be read (does the account exist?).`);
  }
  if (p.private) throw new PrivateInstagramError(username);
  return normalizeApifyInstagram(p, url, username);
}

async function viaWeb(url: string, username: string): Promise<InstagramData> {
  const res = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
    headers: {
      "x-ig-app-id": "936619743392459",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
      accept: "*/*",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 404) throw new Error(`Instagram @${username} doesn't exist.`);
  if (!res.ok) throw new Error(`Instagram asked for a login (${res.status}). Proxima needs its Apify scraper configured to read Instagram.`);
  const j = (await res.json()) as Any;
  const u = j?.data?.user;
  if (!u) throw new Error(`Instagram @${username} could not be read.`);
  if (u.is_private) throw new PrivateInstagramError(username);
  return normalizeWebProfileInfo(u, url, username);
}

export async function fetchInstagram(url: string, username: string): Promise<{ data: InstagramData; via: string }> {
  if (config.apifyToken) {
    try {
      return { data: await viaApify(url, username), via: "apify:apify/instagram-profile-scraper" };
    } catch (e) {
      if (e instanceof PrivateInstagramError) throw e;
      // fall through to the web endpoint as a second chance
      try {
        return { data: await viaWeb(url, username), via: "instagram-web-profile-info" };
      } catch {
        throw e;
      }
    }
  }
  return { data: await viaWeb(url, username), via: "instagram-web-profile-info" };
}
