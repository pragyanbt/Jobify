import { prisma } from "../db";
import { currentUserId } from "../requestContext";
import { estimateCostUsd } from "./pricing";

export type UsageTokens = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

/** Persist one Claude call. Never throws to the caller — logging must not break the product. */
export async function recordUsage(opts: {
  kind: "structured" | "junu";
  model: string;
  usage: UsageTokens;
  userId?: string | null;
}): Promise<void> {
  const userId = opts.userId ?? currentUserId();
  if (!userId) return;
  const inputTokens = opts.usage.inputTokens || 0;
  const outputTokens = opts.usage.outputTokens || 0;
  const cacheReadTokens = opts.usage.cacheReadTokens || 0;
  const cacheWriteTokens = opts.usage.cacheWriteTokens || 0;
  const costUsd = estimateCostUsd({
    model: opts.model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    // One request's prompt length picks Haiku 5.5's rate card. Junu's usage sums several
    // requests (each well under 100K tokens), so it uses the standard rate.
    promptTokens: opts.kind === "structured" ? inputTokens + cacheReadTokens + cacheWriteTokens : 0,
  });
  try {
    await prisma.apiUsage.create({
      data: {
        userId,
        kind: opts.kind,
        model: opts.model,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        costUsd,
      },
    });
  } catch (e) {
    console.error("[jobify] failed to record API usage", (e as Error).message);
  }
}

/** Pull token counts from an Anthropic message usage object. */
export function tokensFromUsage(usage: {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
} | null | undefined): UsageTokens {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
  };
}
