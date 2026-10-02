import { config } from "../config";

// Runs an Apify actor synchronously and returns its dataset items.
// Docs: POST /v2/acts/{actorId}/run-sync-get-dataset-items
export async function runActor<T = Record<string, unknown>>(
  actorId: string,
  input: Record<string, unknown>,
  { timeoutSec = 180 }: { timeoutSec?: number } = {},
): Promise<T[]> {
  if (!config.apifyToken) throw new Error("APIFY_TOKEN is not set");
  const url = `https://api.apify.com/v2/acts/${actorId.replace("/", "~")}/run-sync-get-dataset-items?timeout=${timeoutSec}&clean=true`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.apifyToken}` },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout((timeoutSec + 30) * 1000),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try {
      msg = JSON.parse(text)?.error?.message ?? msg;
    } catch {}
    throw new Error(`Apify ${actorId} failed (${res.status}): ${msg}`);
  }
  const data = JSON.parse(text);
  return Array.isArray(data) ? (data as T[]) : [];
}
