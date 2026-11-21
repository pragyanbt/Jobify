import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { assertCanUseAI } from "../auth";
import { currentUserId } from "../requestContext";
import { recordUsage, tokensFromUsage } from "./usage";

// Claude Haiku 5.5 everywhere by default: the lowest-cost current model
// ($0.10 / $0.50 per million input/output tokens for prompts up to 100K tokens).
// Each role can be overridden with an env var.
/** Junu and anything that doesn't pick another model. */
export const MODEL = process.env.JOBIFY_MODEL ?? "claude-haiku-5-5";
/** Resume tailoring (edits + fact-check). */
export const TAILOR_MODEL = process.env.JOBIFY_TAILOR_MODEL ?? MODEL;
/** Light tasks: email triage, page scrape, quick analysis, LaTeX syntax repair. */
export const CHEAP_MODEL = process.env.JOBIFY_CHEAP_MODEL ?? MODEL;

/**
 * Server-side refusal fallbacks exist only for some models (not Haiku). Spread into a
 * request: `...fallbackParams(model)`.
 */
export function fallbackParams(model: string) {
  return /opus-5|sonnet-5-5|fable|mythos/.test(model)
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
    : {};
}

let client: Anthropic | null = null;
export function getClient(): Anthropic {
  // Resolves ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / `ant auth login` profile.
  return (client ??= new Anthropic());
}

export class AIError extends Error {}

/**
 * One structured call: streams (long inputs/outputs), validates JSON against
 * `schema`, and opts into server-side refusal fallbacks where the model has them.
 */
export async function structured<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  /** Text, or content blocks (e.g. a PDF document block followed by text). */
  user: string | Anthropic.Beta.BetaContentBlockParam[];
  effort?: "low" | "medium" | "high" | "xhigh";
  maxTokens?: number;
  /** Override the default JOBIFY_MODEL. */
  model?: string;
  /** Adaptive thinking burns tokens; off for cheap/low-effort calls. */
  thinking?: boolean;
}): Promise<z.infer<S>> {
  const userId = currentUserId();
  if (userId) await assertCanUseAI(userId);
  const model = opts.model ?? MODEL;
  const effort = opts.effort ?? "medium";
  const thinking = opts.thinking ?? effort !== "low";

  try {
    const stream = getClient().beta.messages.stream({
      model,
      max_tokens: opts.maxTokens ?? 16_000,
      ...fallbackParams(model),
      ...(thinking ? { thinking: { type: "adaptive" as const } } : {}),
      output_config: { effort, format: betaZodOutputFormat(opts.schema) },
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    });
    const msg = await stream.finalMessage();
    void recordUsage({ kind: "structured", model, usage: tokensFromUsage(msg.usage), userId });

    if (msg.stop_reason === "refusal") {
      throw new AIError(
        `The model declined this request${msg.stop_details?.category ? ` (${msg.stop_details.category})` : ""}.`,
      );
    }
    if (msg.stop_reason === "max_tokens") {
      throw new AIError("The model ran out of output tokens before finishing.");
    }
    if (!msg.parsed_output) throw new AIError("The model returned output that didn't match the expected format.");
    return msg.parsed_output as z.infer<S>;
  } catch (err) {
    if (err instanceof AIError) throw err;
    if (err instanceof Anthropic.AuthenticationError) {
      throw new AIError("Claude API authentication failed. Set ANTHROPIC_API_KEY in .env.local.");
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new AIError("Claude API rate limit reached. Try again shortly.");
    }
    if (err instanceof Anthropic.BadRequestError) {
      throw new AIError(`Claude API rejected the request: ${err.message}`);
    }
    if (err instanceof Anthropic.APIError) {
      throw new AIError(`Claude API error ${err.status ?? ""}: ${err.message}`);
    }
    if (err instanceof Anthropic.AnthropicError) {
      // Client-side failure before any request, e.g. no credentials configured.
      throw new AIError(`Claude isn't configured: set ANTHROPIC_API_KEY in .env.local and restart. (${err.message})`);
    }
    throw err;
  }
}

/** Wrap untrusted text so instructions inside it are treated as data. */
export function untrusted(tag: string, text: string): string {
  return `<${tag}>\n${text}\n</${tag}>`;
}
