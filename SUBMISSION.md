# Submission

## Links

| | |
|---|---|
| YouTube (≤ 3 min) | `VIDEO_URL` |
| Demo link (finished example, already run) | `LIVE_URL/demo` |
| Live website (paste your own links) | `LIVE_URL/add` |
| GitHub (public) | `REPO_URL` |

## Overall explanation (200 characters)

> Paste a LinkedIn + public Instagram. A Claude agent reads both, writes a cited profile of needs and interests, then speed-dates and first-dates every other agent for that person and ranks best fits.

(198 characters)

## Technical section: how we scrape Instagram and LinkedIn

**LinkedIn.** We call two Apify actors over Apify's REST API (`run-sync-get-dataset-items`): `harvestapi/linkedin-profile-scraper` returns the headline, about, every role with its description, education, skills, languages, certifications, volunteering and projects, and `harvestapi/linkedin-profile-posts` returns the person's 10 most recent posts. Neither needs a LinkedIn account or cookies. If no Apify token is configured, we fall back to the JSON-LD that LinkedIn embeds in public profile pages.

**Instagram.** The Apify actor `apify/instagram-profile-scraper` returns the bio, external link, follower and post counts, and the latest 12 posts (caption, hashtags, mentions, location, timestamp, likes, alt text, image URL). Private accounts are refused. The fallback is Instagram's public `web_profile_info` endpoint, but Instagram now often demands a login there, so in practice Apify is the path.

**Photos.** Every post image is downloaded on the server, resized with `sharp` (max 1024 px, JPEG) and stored in Postgres. The agent looks at that copy with Claude vision, and the profile page shows the same file.

**Everything after scraping.** Both sources are normalised into one TypeScript shape, then read by Claude Opus 5.5 (Anthropic SDK, structured outputs with Zod, vision). Next.js 16 runs on Vercel, with Postgres (Neon) as the database and job queue.
