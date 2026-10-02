import { config } from "../config";

// Runs an Apify actor synchronously and returns its dataset items.
// Docs: POST /v2/acts/{actorId}/run-sync-get-dataset-items
//
// Apify caps concurrent actor runs per account (5 on the free plan), and each
// person needs three runs. So runs go through an in-process limiter, and a
// "too many concurrent runs" refusal (from another worker) waits and retries.

const MAX_CONCURRENT = Number(process.env.APIFY_MAX_CONCURRENT ?? 4);
let active = 0;
const waiting: (() => void)[] = [];

async function acquire() {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
}

function release() {
  active--;
  waiting.shift()?.();
}

export async function runActor<T = Record<string, unknown>>(
  actorId: string,
  input: Record<string, unknown>,
  { timeoutSec = 180 }: { timeoutSec?: number } = {},
): Promise<T[]> {
  if (!config.apifyToken) throw new Error("APIFY_TOKEN is not set");
  const url = `https://api.apify.com/v2/acts/${actorId.replace("/", "~")}/run-sync-get-dataset-items?timeout=${timeoutSec}&clean=true`;
  for (let attempt = 0; ; attempt++) {
    await acquire();
    let res: Response;
    let text: string;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.apifyToken}` },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout((timeoutSec + 30) * 1000),
      });
      text = await res.text();
    } finally {
      release();
    }
    if (res.ok) {
      const data = JSON.parse(text);
      return Array.isArray(data) ? (data as T[]) : [];
    }
    let msg = text.slice(0, 300);
    try {
      msg = JSON.parse(text)?.error?.message ?? msg;
    } catch {}
    const busy = res.status === 402 && /concurrent/i.test(msg);
    if ((busy || res.status === 429 || res.status >= 500) && attempt < 8) {
      await new Promise((r) => setTimeout(r, 4000 + attempt * 3000 + Math.random() * 2000));
      continue;
    }
    throw new Error(`Apify ${actorId} failed (${res.status}): ${msg}`);
  }
}
