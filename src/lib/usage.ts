import { q } from "./db";

// $ per million tokens: [input, cached input, output].
const PRICES: Record<string, [number, number, number]> = {
  "gpt-6.1-sol": [2, 0.1, 10],
  "gpt-6-sol": [2, 0.2, 10],
  "gpt-6-luna": [0.1, 0.01, 0.5],
  "gpt-6-astra": [10, 1, 50],
};

export async function usageSummary() {
  const rows = await q<{ model: string; purpose: string; calls: number; input: number; output: number; cache_read: number; cache_write: number }>(
    `SELECT model, split_part(purpose, ':', 1) || ':' || split_part(purpose, ':', 2) AS purpose, count(*)::int AS calls,
            sum(input_tokens)::int AS input, sum(output_tokens)::int AS output, sum(cache_read)::int AS cache_read, sum(cache_write)::int AS cache_write
     FROM usage GROUP BY 1,2 ORDER BY 1,2`,
  );
  return rows.map((r) => {
    const [pin, pcached, pout] = PRICES[r.model] ?? [2, 0.1, 10];
    const usd = (r.input * pin + r.cache_read * pcached + r.output * pout) / 1e6;
    return { ...r, usd: Math.round(usd * 100) / 100 };
  });
}
