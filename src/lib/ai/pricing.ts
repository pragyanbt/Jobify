/** USD per million tokens. Override with JOBIFY_PRICE_* env vars if needed. */

type Rates = { input: number; output: number; cacheRead: number; cacheWrite: number };

const OPUS: Rates = {
  input: num("JOBIFY_PRICE_INPUT", 15),
  output: num("JOBIFY_PRICE_OUTPUT", 75),
  cacheRead: num("JOBIFY_PRICE_CACHE_READ", 1.5),
  cacheWrite: num("JOBIFY_PRICE_CACHE_WRITE", 18.75),
};

const SONNET: Rates = {
  input: num("JOBIFY_PRICE_SONNET_INPUT", 3),
  output: num("JOBIFY_PRICE_SONNET_OUTPUT", 15),
  cacheRead: num("JOBIFY_PRICE_SONNET_CACHE_READ", 0.3),
  cacheWrite: num("JOBIFY_PRICE_SONNET_CACHE_WRITE", 3.75),
};

function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Claude Haiku 5.5: two rate cards chosen by prompt length (100K tokens or fewer vs. longer). */
const HAIKU_5_5 = (longPrompt: boolean): Rates => {
  const input = longPrompt ? 0.5 : 0.1;
  return { input, output: longPrompt ? 2.5 : 0.5, cacheRead: input * 0.1, cacheWrite: input * 1.25 };
};
const HAIKU_4_5: Rates = { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 };

function ratesFor(model: string, promptTokens = 0): Rates {
  const m = model.toLowerCase();
  if (m.includes("haiku-5")) return HAIKU_5_5(promptTokens > 100_000);
  if (m.includes("haiku")) return HAIKU_4_5;
  if (m.includes("sonnet")) return SONNET;
  return OPUS;
}

export function estimateCostUsd(opts: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Prompt length of a single request, for models whose rate depends on it (Haiku 5.5). */
  promptTokens?: number;
}): number {
  const r = ratesFor(opts.model, opts.promptTokens ?? 0);
  const cacheRead = opts.cacheReadTokens ?? 0;
  const cacheWrite = opts.cacheWriteTokens ?? 0;
  // Cache tokens are billed separately; the SDK often still reports them under input.
  const billedInput = Math.max(0, opts.inputTokens - cacheRead - cacheWrite);
  const usd =
    (billedInput * r.input +
      opts.outputTokens * r.output +
      cacheRead * r.cacheRead +
      cacheWrite * r.cacheWrite) /
    1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}
