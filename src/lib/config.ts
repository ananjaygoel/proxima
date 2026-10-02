// Central configuration. Every knob is an environment variable so the same
// code runs locally (worker script) and on Vercel (serverless ticks).

function num(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "postgres://localhost:5432/proxima",

  apifyToken: process.env.APIFY_TOKEN ?? "",

  // Models. Defaults follow the current Claude lineup; override per stage if you
  // want a cheaper speed-dating round (e.g. MODEL_SPEED=claude-haiku-4-5).
  models: {
    read: process.env.MODEL_READ ?? "claude-opus-5-5",
    date: process.env.MODEL_DATE ?? "claude-opus-5-5",
    speed: process.env.MODEL_SPEED ?? "claude-opus-5-5",
    debrief: process.env.MODEL_DEBRIEF ?? "claude-opus-5-5",
  },

  // How many full dates each person gets after the speed-dating round.
  fullDatesPerPerson: num("FULL_DATES_PER_PERSON", 3),
  // Turns in a full date (each turn = one agent speaking once).
  fullDateTurns: num("FULL_DATE_TURNS", 12),
  // Turns in a speed date.
  speedDateTurns: num("SPEED_DATE_TURNS", 4),

  // Worker tuning.
  workerConcurrency: num("WORKER_CONCURRENCY", 6),
  tickBudgetMs: num("TICK_BUDGET_MS", 250_000),

  // Abuse / spend guards for the public site.
  guestDailyLimitPerIp: num("GUEST_DAILY_LIMIT_PER_IP", 4),
  guestDailyLimitGlobal: num("GUEST_DAILY_LIMIT_GLOBAL", 60),
  liveDateDailyLimitGlobal: num("LIVE_DATE_DAILY_LIMIT_GLOBAL", 150),

  adminKey: process.env.ADMIN_KEY ?? "",
  // Share /add?invite=<code> with friends who agreed to be in the demo season.
  inviteCode: process.env.INVITE_CODE ?? "",
  tickSecret: process.env.TICK_SECRET ?? process.env.ADMIN_KEY ?? "local-tick",

  // Public origin, used by a tick to re-invoke itself on Vercel.
  publicOrigin:
    process.env.PUBLIC_ORIGIN ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000"),
};

export type Config = typeof config;
