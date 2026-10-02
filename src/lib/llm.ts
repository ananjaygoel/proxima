import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { q } from "./db";

// Thin wrapper around the Messages API used by every agent in Proxima:
// - structured output validated by a Zod schema
// - the agent's stable system prompt is cached (each agent goes on ~25 dates,
//   so its dossier is read from cache on every turn after the first)
// - server-side refusal fallback ("default" routing)
// - token usage is logged so the admin page can show what a season cost

const globalForLlm = globalThis as unknown as { __anthropic?: Anthropic };
function client(): Anthropic {
  if (!globalForLlm.__anthropic) globalForLlm.__anthropic = new Anthropic({ maxRetries: 4, timeout: 180_000 });
  return globalForLlm.__anthropic;
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export async function structured<S extends z.ZodType>(opts: {
  model: string;
  purpose: string;
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[] | string;
  schema: S;
  effort?: Effort;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  if (process.env.LLM_MOCK === "1") return mockFromSchema(opts.schema) as z.infer<S>;

  const content = typeof opts.content === "string" ? [{ type: "text" as const, text: opts.content }] : opts.content;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await client().beta.messages.parse({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content }],
        output_config: { effort: opts.effort ?? "medium", format: betaZodOutputFormat(opts.schema) },
      });
      logUsage(opts.model, opts.purpose, res.usage).catch(() => {});
      if (res.stop_reason === "refusal") {
        throw new Error(`Model declined (${res.stop_details?.category ?? "unknown"})`);
      }
      if (res.stop_reason === "max_tokens") throw new Error("Output was cut off (max_tokens)");
      if (res.parsed_output == null) throw new Error("No structured output returned");
      return res.parsed_output as z.infer<S>;
    } catch (e) {
      lastErr = e;
      // Retry once on parse/validation problems; the SDK already retried transport errors.
      if (e instanceof Anthropic.APIError && e.status && e.status < 500 && e.status !== 429) throw e;
    }
  }
  throw lastErr;
}

async function logUsage(model: string, purpose: string, u: Anthropic.Beta.BetaUsage | undefined) {
  if (!u) return;
  await q(`INSERT INTO usage (model, purpose, input_tokens, output_tokens, cache_read, cache_write) VALUES ($1,$2,$3,$4,$5,$6)`, [
    model,
    purpose,
    u.input_tokens ?? 0,
    u.output_tokens ?? 0,
    u.cache_read_input_tokens ?? 0,
    u.cache_creation_input_tokens ?? 0,
  ]);
}

export function imageBlock(mime: string, b64: string): Anthropic.Beta.BetaImageBlockParam {
  return { type: "image", source: { type: "base64", media_type: mime as "image/jpeg", data: b64 } };
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
        return Math.round(lo + ((counter++ * 37) % 100) / 100 * (hi - lo));
      }
      case "boolean":
        return counter++ % 2 === 0;
      default:
        return `[mock ${key || "text"} ${++counter}]`;
    }
  };
  return schema.parse(gen(js));
}
