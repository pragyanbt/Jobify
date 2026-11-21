import { NextResponse } from "next/server";
import { z } from "zod";
import { authed } from "@/lib/api";
import { getProfile, saveProfile } from "@/lib/profile";

export const GET = authed(async (_req, user) => NextResponse.json(await getProfile(user.id)));

const Fact = z.object({
  id: z.string(),
  category: z.enum(["skill", "experience", "project", "achievement", "certification", "education", "other"]),
  text: z.string(),
  approved: z.boolean(),
  source: z.enum(["user", "extracted"]),
});

const Body = z.object({
  name: z.string().optional(),
  facts: z.array(Fact).optional(),
  rules: z
    .object({
      maxPages: z.number().int().min(1).max(4),
      allowRemoval: z.boolean(),
      neverAdd: z.array(z.string()),
      protectedSections: z.array(z.string()),
      instructions: z.string().max(2000),
    })
    .optional(),
  autoApply: z
    .object({
      enabled: z.boolean(),
      minBaseScore: z.number().min(0).max(100),
      review: z.enum(["always", "on_warnings", "never"]),
      dailyLimit: z.number().int().min(0).max(100),
    })
    .optional(),
  jobSearch: z
    .object({
      enabled: z.boolean(),
      keywords: z.array(z.string().trim().min(1).max(80)).max(20),
      excludeKeywords: z.array(z.string().trim().min(1).max(80)).max(30),
      locations: z.array(z.string().trim().min(1).max(80)).max(10),
      includeRemote: z.boolean(),
      remoteRegions: z.array(z.string().trim().min(1).max(40)).max(20),
      maxAgeDays: z.number().int().min(1).max(60),
      intervalHours: z.number().int().min(0).max(168),
      maxNewPerRun: z.number().int().min(1).max(500),
      sources: z.object({
        greenhouse: z.array(z.string().regex(/^[a-z0-9_-]+$/i)).max(200),
        lever: z.array(z.string().regex(/^[a-z0-9_-]+$/i)).max(200),
        ashby: z.array(z.string().regex(/^[a-z0-9_.-]+$/i)).max(200),
        remotive: z.boolean(),
        adzuna: z.boolean(),
      }),
    })
    .optional(),
});

export const PUT = authed(async (req, user) => {
  await saveProfile(user.id, Body.parse(await req.json()));
  return NextResponse.json(await getProfile(user.id));
});
