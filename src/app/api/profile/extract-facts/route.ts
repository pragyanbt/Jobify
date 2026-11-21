import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authed } from "@/lib/api";
import { prisma } from "@/lib/db";
import { extractFacts } from "@/lib/ai/operations";
import { latexToText } from "@/lib/latex/document";
import { getProfile, saveProfile } from "@/lib/profile";

/** Extract candidate facts from a master resume. They start unapproved. */
export const POST = authed(async (req, user) => {
  const { masterId } = z.object({ masterId: z.string() }).parse(await req.json());
  const master = await prisma.masterResume.findFirstOrThrow({ where: { id: masterId, userId: user.id } });
  const { facts } = await extractFacts(latexToText(master.latex));
  const profile = await getProfile(user.id);
  const known = new Set(profile.facts.map((f) => f.text.trim().toLowerCase()));
  const fresh = facts
    .filter((f) => !known.has(f.text.trim().toLowerCase()))
    .map((f) => ({ id: randomUUID(), category: f.category, text: f.text, approved: false, source: "extracted" as const }));
  await saveProfile(user.id, { facts: [...profile.facts, ...fresh] });
  return NextResponse.json({ added: fresh.length, profile: await getProfile(user.id) });
});
