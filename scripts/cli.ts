// Admin CLI.
//   npm run cli -- add-bulk people.txt [--guest]   one "linkedin instagram" pair per line
//   npm run cli -- season                         book speed dates for every demo pair
//   npm run cli -- status                         queue + people overview
//   npm run cli -- retry <personId>
//   npm run cli -- cost                           token usage so far
import { readFileSync } from "node:fs";
import { closePool, q } from "../src/lib/db";
import { queueStats } from "../src/lib/jobs";
import { addPerson, retryPerson, startSeason } from "../src/lib/pipeline";
import { parseBulk } from "../src/lib/scrape/urls";
import { usageSummary } from "../src/lib/usage";

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "add-bulk") {
    const { ok, errors } = parseBulk(readFileSync(rest[0], "utf8"));
    for (const e of errors) console.log(`line ${e.line}: ${e.error} (${e.text})`);
    for (const l of ok) {
      const r = await addPerson(l, { cohort: rest.includes("--guest") ? "guest" : "demo", consent: true });
      console.log(`${r.existed ? "exists" : "added "} ${r.id}  ${l.linkedinId}  @${l.instagramUsername}`);
    }
  } else if (cmd === "season") {
    console.log(await startSeason());
  } else if (cmd === "status") {
    console.table(await queueStats());
    console.table(await q(`SELECT id, cohort, status, name, stage_detail, left(error, 80) AS error FROM people ORDER BY created_at`));
    console.table(await q(`SELECT kind, origin, status, count(*)::int AS n FROM dates GROUP BY 1,2,3 ORDER BY 1,2,3`));
  } else if (cmd === "retry") {
    await retryPerson(rest[0]);
    console.log("queued");
  } else if (cmd === "cost") {
    console.table(await usageSummary());
  } else {
    console.log("commands: add-bulk <file> [--guest] | season | status | retry <id> | cost");
  }
}
main().finally(() => closePool());
