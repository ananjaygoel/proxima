// LOCAL TESTING ONLY: adds the fictional personas from src/lib/fixtures.ts.
//   npm run fixtures            add them (demo cohort, local db)
//   npm run fixtures -- remove  delete them
import { closePool } from "../src/lib/db";
import { insertFixtures, removeFixtures } from "../src/lib/fixtures";

const run = process.argv.includes("remove") ? removeFixtures().then((n) => console.log("removed", n)) : insertFixtures("demo").then((ids) => console.log("added", ids));
run.finally(() => closePool());
