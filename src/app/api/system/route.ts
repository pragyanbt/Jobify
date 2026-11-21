import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { detectEngine } from "@/lib/latex/compile";
import { CHEAP_MODEL, MODEL, TAILOR_MODEL } from "@/lib/ai/client";
import { listChannels } from "@/lib/channels";

export const GET = authed(async () =>
  NextResponse.json({
    latexEngine: await detectEngine(),
    model: MODEL,
    tailorModel: TAILOR_MODEL,
    cheapModel: CHEAP_MODEL,
    claudeConfigured: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
    channels: listChannels().map((c) => ({ id: c.id, label: c.label, canAutoSubmit: c.canAutoSubmit })),
  }),
);
