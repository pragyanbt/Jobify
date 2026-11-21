import { prisma } from "./db";
import { parseJson } from "./json";

// The user's answers to the questions every application form asks. Kept
// separate from resume evidence: none of this is used for tailoring.

export type YesNo = "" | "yes" | "no";

export interface ApplicationProfile {
  firstName: string;
  lastName: string;
  preferredName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  country: string;
  linkedin: string;
  github: string;
  portfolio: string;
  currentCompany: string;
  currentTitle: string;
  /** Legally authorized to work in the country of the job. */
  workAuthorized: YesNo;
  /** Needs visa sponsorship now or in the future. */
  needsSponsorship: YesNo;
  willingToRelocate: YesNo;
  /** e.g. "2 weeks' notice" or "Immediately". */
  availability: string;
  /** Optional; left blank unless the user wants Junu to state it. */
  salaryExpectation: string;
  /** Default answer to "How did you hear about us?". */
  howHeard: string;
}

export const EMPTY_APPLICATION_PROFILE: ApplicationProfile = {
  firstName: "", lastName: "", preferredName: "", email: "", phone: "",
  city: "", state: "", country: "", linkedin: "", github: "", portfolio: "",
  currentCompany: "", currentTitle: "",
  workAuthorized: "", needsSponsorship: "", willingToRelocate: "",
  availability: "", salaryExpectation: "", howHeard: "Company careers page",
};

/**
 * Voluntary self-identification (US EEO). Opt-in only. When `optIn` is false,
 * every such question is answered "decline to self-identify". These answers are
 * never sent to Claude and never used for matching or scoring.
 */
export interface SelfIdentification {
  optIn: boolean;
  gender: string;
  race: string;
  hispanicLatino: YesNo | "decline";
  veteran: "" | "decline" | "protected" | "not_protected";
  disability: "" | "decline" | "yes" | "no";
}

export const DEFAULT_SELF_ID: SelfIdentification = {
  optIn: false, gender: "", race: "", hispanicLatino: "", veteran: "", disability: "",
};

export async function getApplicationProfile(userId: string, email?: string) {
  const row = await prisma.profile.upsert({ where: { id: userId }, create: { id: userId }, update: {} });
  const profile = { ...EMPTY_APPLICATION_PROFILE, ...parseJson<Partial<ApplicationProfile>>(row.applicationProfile, {}) };
  if (!profile.email && email) profile.email = email;
  const selfId = { ...DEFAULT_SELF_ID, ...parseJson<Partial<SelfIdentification>>(row.selfId, {}) };
  return { profile, selfId };
}

export async function saveApplicationProfile(userId: string, data: { profile?: ApplicationProfile; selfId?: SelfIdentification }) {
  const fields = {
    ...(data.profile && { applicationProfile: JSON.stringify(data.profile) }),
    // Opting out clears whatever was stored.
    ...(data.selfId && { selfId: JSON.stringify(data.selfId.optIn ? data.selfId : DEFAULT_SELF_ID) }),
  };
  await prisma.profile.upsert({ where: { id: userId }, create: { id: userId, ...fields }, update: fields });
}

/** Which profile fields are still empty (for prompting the user). */
export function missingEssentials(p: ApplicationProfile): string[] {
  const need: [keyof ApplicationProfile, string][] = [
    ["firstName", "first name"], ["lastName", "last name"], ["email", "email"], ["phone", "phone"],
    ["city", "city"], ["workAuthorized", "work authorization"], ["needsSponsorship", "sponsorship"],
  ];
  return need.filter(([k]) => !String(p[k]).trim()).map(([, label]) => label);
}
