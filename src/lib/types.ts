// Shared domain types. The zod schemas the LLM must satisfy live in
// src/lib/ai/schemas.ts; these are the persisted/derived shapes.

export type FactCategory =
  | "skill"
  | "experience"
  | "project"
  | "achievement"
  | "certification"
  | "education"
  | "other";

/** An atomic, user-owned fact. Only approved facts count as evidence. */
export interface ProfileFact {
  id: string;
  category: FactCategory;
  text: string;
  approved: boolean;
  source: "user" | "extracted";
}

export interface TailoringRules {
  /** Target page count; validation warns if exceeded. */
  maxPages: number;
  /** Let the model shorten/remove clearly irrelevant content. */
  allowRemoval: boolean;
  /** Terms the tailoring must never introduce, even if supported. */
  neverAdd: string[];
  /** Section headings that must not be removed. */
  protectedSections: string[];
  /** Free-form extra guidance ("keep a formal tone", ...). */
  instructions: string;
}

export interface AutoApplySettings {
  enabled: boolean;
  /** Only jobs whose original match score is >= this qualify. */
  minBaseScore: number;
  /** always: everything goes to the queue; on_warnings: only clean runs skip
   *  the queue; never: submit whenever validation has no errors. */
  review: "always" | "on_warnings" | "never";
  /** Max automatic tailoring runs per day (also caps automatic submissions). */
  dailyLimit: number;
  /** Fully automatic: the Jobify Chrome extension submits ready applications. */
  autoSubmit: boolean;
  /** When the user authorized Junu to submit and attest for them (ISO), or null. */
  consentAt: string | null;
}

/** What the user agrees to when turning on fully automatic submitting. */
export const AUTO_SUBMIT_CONSENT =
  "I authorize Junu to submit job applications on my behalf, using my resume and application profile, and to confirm " +
  "standard statements such as \"the information I provided is accurate\". Junu won't opt me into marketing messages " +
  "and won't answer questions it can't answer truthfully.";

export const DEFAULT_RULES: TailoringRules = {
  maxPages: 1,
  allowRemoval: true,
  neverAdd: [],
  protectedSections: ["Education"],
  instructions: "",
};

export const DEFAULT_AUTO_APPLY: AutoApplySettings = {
  enabled: false,
  minBaseScore: 55,
  review: "always",
  dailyLimit: 10,
  autoSubmit: false,
  consentAt: null,
};

export interface AnalyzedTerm {
  name: string;
  aliases: string[];
}

export interface JobAnalysis {
  title: string;
  company: string;
  seniority: string;
  summary: string;
  requiredSkills: AnalyzedTerm[];
  preferredSkills: AnalyzedTerm[];
  atsKeywords: (AnalyzedTerm & { importance: 1 | 2 | 3 })[];
  qualifications: { text: string; required: boolean; kind: string }[];
  minYearsExperience: number | null;
  responsibilities: string[];
}

export interface TermHit {
  term: string;
  group: "required" | "preferred" | "keyword";
  weight: number;
  matched: boolean;
  count: number;
}

export interface ScoreBreakdown {
  score: number; // 0-100
  hits: TermHit[];
  byGroup: Record<TermHit["group"], { matched: number; total: number }>;
}

export interface MatchReport {
  original: ScoreBreakdown;
  tailored: ScoreBreakdown;
  matching: string[];
  missing: string[]; // requirements absent from BOTH resume and approved facts
  added: string[]; // matched in tailored but not original
  emphasized: string[]; // mention count increased
  requiredQualifications: string[]; // for the user to self-check
}

export type ChangeKind =
  | "summary"
  | "skills"
  | "reorder"
  | "bullet"
  | "remove"
  | "keyword"
  | "other";

export interface ChangeRecord {
  kind: ChangeKind;
  before: string;
  after: string;
  reason: string;
  evidence: string;
  status: "applied" | "rejected";
  rejectReason?: string;
}

export interface ValidationIssue {
  severity: "error" | "warning";
  code:
    | "preamble_changed"
    | "unsupported_skill"
    | "unsupported_number"
    | "never_add"
    | "protected_section"
    | "compile_failed"
    | "page_count"
    | "fact_check"
    | "blocked_command";
  message: string;
  detail?: string;
}

export interface ValidationReport {
  ok: boolean; // no errors
  issues: ValidationIssue[];
  checkedAt: string;
}

export interface PipelineStep {
  key: string;
  label: string;
  status: "pending" | "running" | "done" | "skipped" | "error";
  detail?: string;
}

// ---------------------------------------------------------------- job search

export interface JobSearchSettings {
  enabled: boolean;
  /** Target job titles, e.g. "Java Developer". Matched against posting titles. */
  keywords: string[];
  /** Skip postings whose title contains any of these, e.g. "Principal", "Intern". */
  excludeKeywords: string[];
  /** Acceptable on-site/hybrid locations, e.g. "Dallas, TX". Empty = anywhere. */
  locations: string[];
  includeRemote: boolean;
  /** Remote postings must be open to one of these regions ("Remote" alone counts). */
  remoteRegions: string[];
  /** Only postings published within this many days. */
  maxAgeDays: number;
  /** Automatic search interval; 0 = manual only. */
  intervalHours: number;
  /** Cap on new jobs saved per run. */
  maxNewPerRun: number;
  sources: {
    greenhouse: string[];
    lever: string[];
    ashby: string[];
    remotive: boolean;
    /** Needs ADZUNA_APP_ID / ADZUNA_APP_KEY. */
    adzuna: boolean;
  };
}

export interface SourceReport {
  source: string;
  fetched: number;
  matched: number;
  added: number;
  error?: string;
}

export interface JobSearchStatus {
  running?: boolean;
  lastRunAt?: string;
  durationMs?: number;
  reports?: SourceReport[];
  added?: number;
}

export const DEFAULT_JOB_SEARCH: JobSearchSettings = {
  enabled: true,
  keywords: [], // nothing is searched until the user sets target titles
  excludeKeywords: ["Intern", "Principal", "Director", "Manager"],
  locations: [],
  includeRemote: true,
  remoteRegions: ["US", "USA", "United States", "North America", "Americas", "Anywhere", "Worldwide"],
  maxAgeDays: 14,
  intervalHours: 6,
  maxNewPerRun: 150,
  sources: {
    greenhouse: [
      "stripe", "airbnb", "robinhood", "coinbase", "lyft", "pinterest", "dropbox", "datadog", "twilio",
      "cloudflare", "gitlab", "figma", "discord", "instacart", "reddit", "roblox", "affirm", "brex",
      "samsara", "mongodb", "elastic", "okta", "toast", "doordashusa", "chime", "squarespace", "asana",
      "gusto", "databricks", "anthropic", "vercel", "duolingo", "carta", "mercury", "flexport", "verkada", "axon",
      "sofi", "zscaler", "upstart", "block", "sigmacomputing", "smartsheet", "stackadapt", "peloton",
    ],
    lever: ["palantir", "spotify", "zoox", "outreach", "wealthfront"],
    ashby: ["ramp", "notion", "linear", "openai", "supabase", "vanta", "replit", "posthog", "zip", "cerebras", "mercor"],
    remotive: true,
    adzuna: false,
  },
};
