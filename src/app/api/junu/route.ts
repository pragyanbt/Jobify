import { z } from "zod";
import { authed } from "@/lib/api";
import { junuErrorMessage, runJunu, type JunuEvent } from "@/lib/junu/agent";

export const maxDuration = 300;

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(60_000) }))
    .min(1)
    .max(200),
  page: z.string().max(300).nullish(),
  /** "Ask before acting": Junu proposes changes and waits for the user's OK. */
  confirmFirst: z.boolean().optional(),
});

/**
 * One chat turn with Junu. Streams newline-delimited JSON events (text, tool
 * activity, effects for the UI to refresh, done/error) as the agent works.
 */
export const POST = authed(async (req, user) => {
  const { messages, page, confirmFirst } = Body.parse(await req.json());
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: JunuEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          /* client went away */
        }
      };
      try {
        await runJunu(user, messages, { page: page ?? null, confirmFirst: !!confirmFirst }, emit, req.signal);
      } catch (err) {
        if (!req.signal.aborted) {
          console.error("[junu]", err);
          emit({ type: "error", message: junuErrorMessage(err) });
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
});
