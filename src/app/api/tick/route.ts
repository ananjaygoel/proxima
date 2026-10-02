import { after } from "next/server";
import { config } from "@/lib/config";
import { claimTickSlot, pendingCount, releaseTickSlot, renewTickSlot, tickUrl } from "@/lib/jobs";
import { runWorker } from "@/lib/pipeline";

// One worker invocation: drains the queue for up to ~4.5 minutes, then
// re-invokes itself if jobs remain. Protected by a shared secret.
export const maxDuration = 300;

async function tick(req: Request) {
  if (req.headers.get("x-tick-secret") !== config.tickSecret) return new Response("forbidden", { status: 403 });
  const slot = await claimTickSlot();
  if (!slot) return Response.json({ ok: true, skipped: "all worker slots busy" }, { status: 202 });
  after(async () => {
    const renew = setInterval(() => renewTickSlot(slot).catch(() => {}), 10_000);
    try {
      await runWorker({ budgetMs: config.tickBudgetMs, concurrency: config.workerConcurrency, stopClaimingWithMs: 110_000, exitWhenIdle: true });
    } finally {
      clearInterval(renew);
      await releaseTickSlot(slot).catch(() => {});
    }
    if ((await pendingCount()) > 0) {
      await fetch(tickUrl(), { method: "POST", headers: { "x-tick-secret": config.tickSecret }, signal: AbortSignal.timeout(8000) }).catch(() => {});
    }
  });
  return Response.json({ ok: true }, { status: 202 });
}

export const POST = tick;
