// Uploads the generated demo people to a deployment's admin import endpoint.
//   npm run synth:upload -- https://proxima-dating.vercel.app
import { readdirSync, readFileSync } from "node:fs";

const target = (process.argv[2] ?? process.env.PUBLIC_ORIGIN ?? "http://localhost:3100").replace(/\/$/, "");
const key = process.env.ADMIN_KEY;
const dir = "scripts/_scratch/synth-out";

async function main() {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  console.log(`uploading ${files.length} people to ${target}`);
  for (const f of files) {
    const persona = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
    for (let attempt = 1; attempt <= 3; attempt++) {
      const r = await fetch(`${target}/api/admin/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ adminKey: key, persona }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        console.log(`${j.existed ? "exists" : "added "} ${j.id}  ${persona.linkedin.name}`);
        break;
      }
      console.log(`retry ${f} (${r.status} ${JSON.stringify(j).slice(0, 120)})`);
      await new Promise((res) => setTimeout(res, 3000 * attempt));
    }
  }
}
main();
