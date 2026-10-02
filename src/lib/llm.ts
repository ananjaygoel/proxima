import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { q } from "./db";

// Thin wrapper around the OpenAI Responses API used by every agent in Proxima:
// - structured output validated by a Zod schema (strict JSON schema)
// - the agent's stable instructions come first and carry a prompt_cache_key,
//   so an agent re-reads its own dossier from cache on every turn of every date
// - token usage is logged so the admin page can show what a season cost

const globalForLlm = globalThis as unknown as { __openai?: OpenAI };
function client(): OpenAI {
  if (!globalForLlm.__openai) globalForLlm.__openai = new OpenAI({ maxRetries: 4, timeout: 240_000 });
  return globalForLlm.__openai;
}

export type Effort = "low" | "medium" | "high";
export type Block = { type: "text"; text: string } | { type: "image"; mime: string; b64: string };

export async function structured<S extends z.ZodType>(opts: {
  model: string;
  purpose: string;
  system: string;
  content: Block[] | string;
  schema: S;
  effort?: Effort;
  maxTokens?: number;
  cacheKey?: string;
}): Promise<z.infer<S>> {
  if (process.env.LLM_MOCK === "1") return mockFromSchema(opts.schema) as z.infer<S>;

  const blocks: Block[] = typeof opts.content === "string" ? [{ type: "text", text: opts.content }] : opts.content;
  const content = blocks.map((b) =>
    b.type === "text"
      ? ({ type: "input_text", text: b.text } as const)
      : ({ type: "input_image", image_url: `data:${b.mime};base64,${b.b64}`, detail: "auto" } as const),
  );
  const name = opts.purpose.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await client().responses.parse({
        model: opts.model,
        instructions: opts.system,
        input: [{ role: "user", content }],
        text: { format: zodTextFormat(opts.schema, name) },
        reasoning: { effort: opts.effort ?? "medium" },
        max_output_tokens: opts.maxTokens ?? 16000,
        prompt_cache_key: opts.cacheKey,
        store: false,
      });
      logUsage(opts.model, opts.purpose, res.usage).catch(() => {});
      if (res.status === "incomplete") throw new Error(`Output incomplete: ${res.incomplete_details?.reason ?? "unknown"}`);
      const refusal = res.output
        .flatMap((o) => (o.type === "message" ? o.content : []))
        .find((c) => c.type === "refusal");
      if (refusal && refusal.type === "refusal") throw new Error(`Model declined: ${refusal.refusal}`);
      if (res.output_parsed == null) throw new Error("No structured output returned");
      return res.output_parsed as z.infer<S>;
    } catch (e) {
      lastErr = e;
      // Don't retry requests that can never succeed; the SDK already retried transport errors and 429s.
      if (e instanceof OpenAI.APIError && e.status && e.status >= 400 && e.status < 500 && e.status !== 429) throw e;
      if (opts.maxTokens && String((e as Error).message).includes("max_output_tokens")) opts.maxTokens *= 2;
    }
  }
  throw lastErr;
}

async function logUsage(model: string, purpose: string, u: OpenAI.Responses.ResponseUsage | undefined) {
  if (!u) return;
  const cached = u.input_tokens_details?.cached_tokens ?? 0;
  await q(`INSERT INTO usage (model, purpose, input_tokens, output_tokens, cache_read, cache_write) VALUES ($1,$2,$3,$4,$5,0)`, [
    model,
    purpose,
    (u.input_tokens ?? 0) - cached,
    u.output_tokens ?? 0,
    cached,
  ]);
}

export function imageBlock(mime: string, b64: string): Block {
  return { type: "image", mime, b64 };
}

// ---- offline mock (LLM_MOCK=1): schema-valid filler so the UI and job flow
// can be exercised without an API key. Never used in production.
function mockFromSchema(schema: z.ZodType): unknown {
  const js = z.toJSONSchema(schema) as Record<string, unknown>;
  const defs = (js.$defs ?? js.definitions ?? {}) as Record<string, unknown>;
  let counter = 0;
  const gen = (node: Record<string, unknown>, key = ""): unknown => {
    if (node.$ref) return gen(defs[String(node.$ref).split("/").pop()!] as Record<string, unknown>, key);
    if (node.anyOf) return gen((node.anyOf as Record<string, unknown>[]).find((x) => x.type !== "null") ?? {}, key);
    if (node.enum) return (node.enum as unknown[])[counter++ % (node.enum as unknown[]).length];
    if (node.const !== undefined) return node.const;
    switch (node.type) {
      case "object": {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries((node.properties ?? {}) as Record<string, Record<string, unknown>>)) out[k] = gen(v, k);
        return out;
      }
      case "array": {
        const min = Number(node.minItems ?? 2);
        return Array.from({ length: Math.max(min, 2) }, () => gen(node.items as Record<string, unknown>, key));
      }
      case "integer":
      case "number": {
        const lo = Number(node.minimum ?? 0);
        const hi = Number(node.maximum ?? 100);
        return Math.round(lo + (((counter++ * 37) % 100) / 100) * (hi - lo));
      }
      case "boolean":
        return true;
      default:
        return `[mock ${key || "text"} ${++counter}]`;
    }
  };
  return schema.parse(gen(js));
}
