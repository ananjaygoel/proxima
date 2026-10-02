import { q } from "./db";

// $ per million tokens (input, output). Cache reads/writes priced off input.
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
  "claude-fable-5-1": [10, 50],
};

export async function usageSummary() {
  const rows = await q<{ model: string; purpose: string; calls: number; input: number; output: number; cache_read: number; cache_write: number }>(
    `SELECT model, split_part(purpose, ':', 1) || ':' || split_part(purpose, ':', 2) AS purpose, count(*)::int AS calls,
            sum(input_tokens)::int AS input, sum(output_tokens)::int AS output, sum(cache_read)::int AS cache_read, sum(cache_write)::int AS cache_write
     FROM usage GROUP BY 1,2 ORDER BY 1,2`,
  );
  return rows.map((r) => {
    const [pin, pout] = PRICES[r.model] ?? [4, 20];
    const usd = (r.input * pin + r.cache_write * pin * 1.25 + r.cache_read * pin * 0.05 + r.output * pout) / 1e6;
    return { ...r, usd: Math.round(usd * 100) / 100 };
  });
}
