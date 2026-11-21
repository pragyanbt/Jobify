import { prisma } from "./db";
import { parseJson } from "./json";
import {
  DEFAULT_AUTO_APPLY,
  DEFAULT_JOB_SEARCH,
  DEFAULT_RULES,
  type AutoApplySettings,
  type JobSearchSettings,
  type ProfileFact,
  type TailoringRules,
} from "./types";

export interface LoadedProfile {
  name: string;
  facts: ProfileFact[];
  rules: TailoringRules;
  autoApply: AutoApplySettings;
  jobSearch: JobSearchSettings;
}

export async function getProfile(userId: string): Promise<LoadedProfile> {
  const row = await prisma.profile.upsert({ where: { id: userId }, create: { id: userId }, update: {} });
  return {
    name: row.name,
    facts: parseJson<ProfileFact[]>(row.facts, []),
    rules: { ...DEFAULT_RULES, ...parseJson<Partial<TailoringRules>>(row.tailoringRules, {}) },
    autoApply: { ...DEFAULT_AUTO_APPLY, ...parseJson<Partial<AutoApplySettings>>(row.autoApply, {}) },
    jobSearch: mergeJobSearch(parseJson<Partial<JobSearchSettings>>(row.jobSearch, {})),
  };
}

export async function saveProfile(userId: string, p: Partial<LoadedProfile>) {
  await prisma.profile.upsert({
    where: { id: userId },
    create: { id: userId },
    update: {
      ...(p.name !== undefined && { name: p.name }),
      ...(p.facts && { facts: JSON.stringify(p.facts) }),
      ...(p.rules && { tailoringRules: JSON.stringify(p.rules) }),
      ...(p.autoApply && { autoApply: JSON.stringify(p.autoApply) }),
      ...(p.jobSearch && { jobSearch: JSON.stringify(p.jobSearch) }),
    },
  });
}

/** Only approved facts are evidence for tailoring and validation. */
export function approvedFactsText(facts: ProfileFact[]): string {
  return facts
    .filter((f) => f.approved && f.text.trim())
    .map((f) => `- [${f.category}] ${f.text.trim()}`)
    .join("\n");
}

function mergeJobSearch(saved: Partial<JobSearchSettings>): JobSearchSettings {
  return {
    ...DEFAULT_JOB_SEARCH,
    ...saved,
    sources: { ...DEFAULT_JOB_SEARCH.sources, ...(saved.sources ?? {}) },
  };
}
