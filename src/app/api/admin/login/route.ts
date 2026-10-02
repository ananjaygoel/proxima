import { cookies } from "next/headers";
import { config } from "@/lib/config";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { key?: string };
  if (!config.adminKey || body.key !== config.adminKey) return Response.json({ error: "Wrong key." }, { status: 403 });
  (await cookies()).set("px_admin", body.key, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/" });
  return Response.json({ ok: true });
}
