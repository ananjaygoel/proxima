import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { config } from "./config";

// One pool per process. On Vercel (Fluid compute) the module stays warm between
// invocations, so the pool is reused; Neon's pooled endpoint absorbs the rest.
const globalForDb = globalThis as unknown as { __proximaPool?: Pool; __proximaSchema?: Promise<void> };

function pool(): Pool {
  if (!globalForDb.__proximaPool) {
    const url = config.databaseUrl;
    const isLocal = /localhost|127\.0\.0\.1/.test(url);
    globalForDb.__proximaPool = new Pool({
      connectionString: url,
      max: Number(process.env.DB_POOL_MAX ?? 8),
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
      idleTimeoutMillis: 20_000,
    });
  }
  return globalForDb.__proximaPool;
}

export async function q<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const res = await pool().query<T>(text, params as unknown[]);
  return res.rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS people (
  id text PRIMARY KEY,
  cohort text NOT NULL DEFAULT 'guest',
  status text NOT NULL DEFAULT 'queued',
  stage_detail text,
  error text,
  linkedin_url text NOT NULL,
  linkedin_id text NOT NULL,
  instagram_url text NOT NULL,
  instagram_username text NOT NULL,
  name text,
  headline text,
  city text,
  photo_image_id text,
  creator_token text,
  creator_ip text,
  consent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS people_linkedin_uq ON people (linkedin_id);

CREATE TABLE IF NOT EXISTS sources (
  person_id text NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  kind text NOT NULL,
  data jsonb NOT NULL,
  fetched_via text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, kind)
);

CREATE TABLE IF NOT EXISTS images (
  id text PRIMARY KEY,
  person_id text NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ref text,
  mime text NOT NULL,
  data_b64 text NOT NULL,
  width int,
  height int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS images_person ON images (person_id);

CREATE TABLE IF NOT EXISTS notes (
  id bigserial PRIMARY KEY,
  person_id text NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  source text NOT NULL,
  ref text,
  quote text,
  observation text NOT NULL,
  category text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notes_person ON notes (person_id, id);

CREATE TABLE IF NOT EXISTS profiles (
  person_id text PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dates (
  id text PRIMARY KEY,
  kind text NOT NULL,
  origin text NOT NULL,
  a_id text NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  b_id text NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  pair_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  stage text,
  plan jsonb,
  turns jsonb NOT NULL DEFAULT '[]'::jsonb,
  verdict_a jsonb,
  verdict_b jsonb,
  fit_ab int,
  fit_ba int,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS dates_a ON dates (a_id);
CREATE INDEX IF NOT EXISTS dates_b ON dates (b_id);
CREATE UNIQUE INDEX IF NOT EXISTS dates_pair_uq ON dates (kind, pair_key) WHERE origin <> 'live';

CREATE TABLE IF NOT EXISTS jobs (
  id bigserial PRIMARY KEY,
  type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  priority int NOT NULL DEFAULT 50,
  run_after timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_dedupe_uq ON jobs (dedupe_key) WHERE status IN ('pending','running');
CREATE INDEX IF NOT EXISTS jobs_claim ON jobs (status, priority, run_after);

CREATE TABLE IF NOT EXISTS usage (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  model text NOT NULL,
  purpose text NOT NULL,
  input_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  cache_read int NOT NULL DEFAULT 0,
  cache_write int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS meta (
  key text PRIMARY KEY,
  value jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rate (
  key text NOT NULL,
  day date NOT NULL DEFAULT current_date,
  count int NOT NULL DEFAULT 0,
  PRIMARY KEY (key, day)
);
`;

export function ensureSchema(): Promise<void> {
  if (!globalForDb.__proximaSchema) {
    globalForDb.__proximaSchema = (async () => {
      const c = await pool().connect();
      try {
        // Serialise concurrent cold starts creating the schema.
        await c.query("SELECT pg_advisory_lock(424242)");
        await c.query(SCHEMA);
      } finally {
        await c.query("SELECT pg_advisory_unlock(424242)").catch(() => {});
        c.release();
      }
    })().catch((e) => {
      globalForDb.__proximaSchema = undefined;
      throw e;
    });
  }
  return globalForDb.__proximaSchema;
}

export async function closePool() {
  await globalForDb.__proximaPool?.end();
  globalForDb.__proximaPool = undefined;
  globalForDb.__proximaSchema = undefined;
}
