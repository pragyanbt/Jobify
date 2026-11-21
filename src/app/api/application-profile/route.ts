import { NextResponse } from "next/server";
import { z } from "zod";
import { authed } from "@/lib/api";
import { getApplicationProfile, missingEssentials, saveApplicationProfile } from "@/lib/applyProfile";

const s = (max = 200) => z.string().trim().max(max);
const yn = z.enum(["", "yes", "no"]);

const Profile = z.object({
  firstName: s(), lastName: s(), preferredName: s(), email: s(), phone: s(60),
  city: s(), state: s(), country: s(), linkedin: s(500), github: s(500), portfolio: s(500),
  currentCompany: s(), currentTitle: s(),
  workAuthorized: yn, needsSponsorship: yn, willingToRelocate: yn,
  availability: s(), salaryExpectation: s(), howHeard: s(),
});

const SelfId = z.object({
  optIn: z.boolean(),
  gender: s(80),
  race: s(120),
  hispanicLatino: z.enum(["", "yes", "no", "decline"]),
  veteran: z.enum(["", "decline", "protected", "not_protected"]),
  disability: z.enum(["", "decline", "yes", "no"]),
});

export const GET = authed(async (_req, user) => {
  const data = await getApplicationProfile(user.id, user.email);
  return NextResponse.json({ ...data, missing: missingEssentials(data.profile) });
});

export const PUT = authed(async (req, user) => {
  const body = z.object({ profile: Profile.optional(), selfId: SelfId.optional() }).parse(await req.json());
  await saveApplicationProfile(user.id, body);
  const data = await getApplicationProfile(user.id, user.email);
  return NextResponse.json({ ...data, missing: missingEssentials(data.profile) });
});
