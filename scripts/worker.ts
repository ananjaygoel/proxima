// Drains the job queue from your machine (no serverless time limits).
// Use it to run the demo season:  npm run worker
import { config } from "../src/lib/config";
import { closePool } from "../src/lib/db";
import { runWorker } from "../src/lib/pipeline";

const concurrency = Number(process.argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? config.workerConcurrency);
const once = process.argv.includes("--exit-when-idle");

console.log(`worker: concurrency ${concurrency}, db ${config.databaseUrl.replace(/:[^:@/]+@/, ":***@")}`);
runWorker({ budgetMs: 1000 * 60 * 60 * 6, concurrency, exitWhenIdle: once })
  .then((n) => console.log(`worker: processed ${n} jobs`))
  .finally(() => closePool());
