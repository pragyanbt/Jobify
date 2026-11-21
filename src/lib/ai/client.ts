import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const MODEL = process.env.JOBIFY_MODEL ?? "claude-opus-5-5";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Resolves ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / `ant auth login` profile.
  return (client ??= new Anthropic());
}

export class AIError extends Error {}

/**
 * One structured call: streams (long inputs/outputs), uses adaptive thinking,
 * validates the JSON response against `schema`, and opts into server-side
 * refusal fallbacks so a classifier false-positive doesn't fail a tailoring run.
 */
export async function structured<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  /** Text, or content blocks (e.g. a PDF document block followed by text). */
  user: string | Anthropic.Beta.BetaContentBlockParam[];
  effort?: "low" | "medium" | "high" | "xhigh";
  maxTokens?: number;
}): Promise<z.infer<S>> {
  try {
    const stream = getClient().beta.messages.stream({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort ?? "high", format: betaZodOutputFormat(opts.schema) },
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    });
    const msg = await stream.finalMessage();

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
