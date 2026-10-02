import { isAdmin } from "@/lib/server";
import { queueStats } from "@/lib/jobs";
import { usageSummary } from "@/lib/usage";
import { q } from "@/lib/db";
import { AdminPanel, AdminLogin } from "./panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

export default async function AdminPage() {
  if (!(await isAdmin())) return <AdminLogin />;
  const [queue, usage, people, dates] = await Promise.all([
    queueStats(),
    usageSummary(),
    q<{ id: string; name: string | null; cohort: string; status: string; error: string | null; linkedin_id: string; instagram_username: string }>(
      `SELECT id, name, cohort, status, error, linkedin_id, instagram_username FROM people ORDER BY cohort, created_at`,
    ),
    q<{ kind: string; status: string; n: number }>(`SELECT kind, status, count(*)::int AS n FROM dates GROUP BY 1,2 ORDER BY 1,2`),
  ]);
  return <AdminPanel queue={queue} usage={usage} people={people} dates={dates} />;
}
