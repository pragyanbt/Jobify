import type { ApplicationProfile, SelfIdentification } from "./applyProfile";
import { decodeEntities, htmlToText } from "./jobsearch/html";
import { safeFetchText } from "./net";
import { needsYou, type DraftAnswer, type FormQuestion, type QuestionKind, type Section } from "./applicationTypes";

// An employer's application form, normalized, plus the answers Jobify can fill
// in without AI (from the application profile). Questions come from the public
// Greenhouse job-board API when the job is a Greenhouse posting; otherwise a
// standard set of common questions is used.

export type { AnswerSource, DraftAnswer, FormQuestion, QuestionKind, Section } from "./applicationTypes";

export interface FormSpec {
  source: "greenhouse" | "standard";
  questions: FormQuestion[];
}

// ------------------------------------------------------------------ loading

interface GhField { name: string; type: string; values?: { label: string; value: string | number }[] }
interface GhQuestion { label: string; description?: string | null; required: boolean; fields: GhField[] }
export interface GhJobWithQuestions {
  questions?: GhQuestion[];
  location_questions?: GhQuestion[];
  compliance?: { type: string; description?: string | null; questions: GhQuestion[] }[] | null;
  demographic_questions?: unknown;
}

const KIND: Record<string, QuestionKind | undefined> = {
  input_text: "text",
  textarea: "textarea",
  multi_value_single_select: "select",
  multi_value_multi_select: "multiselect",
  input_file: "file",
};

const CONSENT_RE = /\b(certify|acknowledg|consent|i agree|agree to|privacy (policy|notice)|opt[- ]?in|whatsapp|sms|text messages?|marketing|terms of)/i;
const ELIGIBILITY_RE = /authori[sz]|sponsor|visa|work permit|relocat|legally (able|eligible)|right to work/i;
const DETAILS = new Set(["first_name", "last_name", "preferred_name", "email", "phone", "location"]);

function sectionFor(id: string, label: string, kind: QuestionKind): Section {
  if (kind === "file") return "attachments";
  if (DETAILS.has(id)) return "details";
  if (CONSENT_RE.test(label)) return "consent";
  if (ELIGIBILITY_RE.test(label)) return "eligibility";
  return "questions";
}

function cleanLabel(s: string) {
  return decodeEntities(s).replace(/\s+/g, " ").trim();
}

/** Normalize a Greenhouse `?questions=true` job payload. Exported for tests. */
export function normalizeGreenhouse(j: GhJobWithQuestions): FormQuestion[] {
  const out: FormQuestion[] = [];
  const add = (q: GhQuestion, forced?: Section) => {
    // A question can have a file field and a paste-text alternative; use the first visible field.
    const field = q.fields.find((f) => KIND[f.type]);
    if (!field) return; // hidden fields (latitude/longitude)
    const kind = KIND[field.type]!;
    const label = cleanLabel(q.label);
    out.push({
      id: field.name.replace(/\[\]$/, ""),
      label: label === "VeteranStatus" ? "Veteran status" : label === "DisabilityStatus" ? "Disability status" : label,
      description: q.description ? htmlToText(q.description).slice(0, 600) : undefined,
      required: q.required,
      kind,
      options: field.values?.map((v) => ({ label: cleanLabel(v.label), value: String(v.value) })),
      section: forced ?? sectionFor(field.name, label, kind),
    });
  };
  for (const q of j.questions ?? []) add(q);
  for (const q of j.location_questions ?? []) add(q, "details");
  for (const group of j.compliance ?? []) for (const q of group.questions) add(q, "self_id");
  // De-duplicate by id (location appears in both lists on some boards).
  return out.filter((q, i) => out.findIndex((x) => x.id === q.id) === i);
}

const YES_NO = [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }];
const DECLINE = { label: "I don't wish to answer", value: "decline" };

/** Common questions, used when the employer's real form isn't available. */
export const STANDARD_QUESTIONS: FormQuestion[] = [
  { id: "first_name", label: "First name", required: true, kind: "text", section: "details" },
  { id: "last_name", label: "Last name", required: true, kind: "text", section: "details" },
  { id: "email", label: "Email", required: true, kind: "text", section: "details" },
  { id: "phone", label: "Phone", required: true, kind: "text", section: "details" },
  { id: "location", label: "Location (city)", required: false, kind: "text", section: "details" },
  { id: "linkedin", label: "LinkedIn profile", required: false, kind: "text", section: "details" },
  { id: "website", label: "GitHub, portfolio or website", required: false, kind: "text", section: "details" },
  { id: "current_company", label: "Current or most recent employer", required: false, kind: "text", section: "questions" },
  { id: "current_title", label: "Current or most recent job title", required: false, kind: "text", section: "questions" },
  { id: "work_authorized", label: "Are you legally authorized to work in the country where this job is located?", required: true, kind: "select", options: YES_NO, section: "eligibility" },
  { id: "sponsorship", label: "Will you now or in the future require visa sponsorship?", required: true, kind: "select", options: YES_NO, section: "eligibility" },
  { id: "relocate", label: "Are you willing to relocate?", required: false, kind: "select", options: YES_NO, section: "eligibility" },
  { id: "availability", label: "When can you start?", required: false, kind: "text", section: "questions" },
  { id: "salary", label: "Salary expectations", required: false, kind: "text", section: "questions" },
  { id: "how_heard", label: "How did you hear about this job?", required: false, kind: "text", section: "questions" },
  { id: "why_interested", label: "Why are you interested in this role?", required: false, kind: "textarea", section: "questions" },
  { id: "resume", label: "Resume/CV", required: true, kind: "file", section: "attachments" },
  { id: "cover_letter", label: "Cover letter", required: false, kind: "file", section: "attachments" },
  { id: "gender", label: "Gender", required: false, kind: "select", section: "self_id", options: [DECLINE, { label: "Female", value: "female" }, { label: "Male", value: "male" }, { label: "Non-binary", value: "non_binary" }] },
  { id: "race", label: "Race/ethnicity", required: false, kind: "select", section: "self_id", options: [DECLINE, ...["American Indian or Alaska Native", "Asian", "Black or African American", "Hispanic or Latino", "Native Hawaiian or Other Pacific Islander", "White", "Two or More Races"].map((l) => ({ label: l, value: l }))] },
  { id: "veteran_status", label: "Veteran status", required: false, kind: "select", section: "self_id", options: [DECLINE, { label: "I identify as a protected veteran", value: "protected" }, { label: "I am not a protected veteran", value: "not_protected" }] },
  { id: "disability_status", label: "Disability status", required: false, kind: "select", section: "self_id", options: [DECLINE, { label: "Yes, I have a disability", value: "yes" }, { label: "No, I don't have a disability", value: "no" }] },
];

/** The job's real form when available (Greenhouse), else the standard set. */
export async function loadForm(externalKey: string | null): Promise<FormSpec> {
  const m = externalKey?.match(/^greenhouse:([^:]+):(\d+)$/);
  if (m) {
    try {
      const r = await safeFetchText(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(m[1])}/jobs/${m[2]}?questions=true`,
        "application/json",
      );
      const questions = normalizeGreenhouse(JSON.parse(r.text) as GhJobWithQuestions);
      if (questions.length) return { source: "greenhouse", questions };
    } catch (e) {
      console.warn("[jobify] couldn't load Greenhouse questions; using the standard set", (e as Error).message);
    }
  }
  return { source: "standard", questions: STANDARD_QUESTIONS };
}

// ------------------------------------------------------------------ profile answers (no AI)

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Pick the option whose label matches `want` (exact, then prefix, then contains). */
export function pickOption(q: FormQuestion, want: string | RegExp): string | null {
  const opts = q.options ?? [];
  if (want instanceof RegExp) return opts.find((o) => want.test(o.label))?.value ?? null;
  const w = norm(want);
  if (!w) return null;
  return (
    opts.find((o) => norm(o.label) === w)?.value ??
    opts.find((o) => norm(o.label).startsWith(w))?.value ??
    opts.find((o) => norm(o.label).includes(w) || w.includes(norm(o.label)))?.value ??
    null
  );
}

/** Hint for answers that come from the application profile. */
const missing = (what: string) => `Add your ${what} in Settings → Autopilot.`;

const DECLINE_RE = /decline|don.?t wish|do not wish|prefer not|choose not/i;

function yesNo(q: FormQuestion, v: "" | "yes" | "no", what: string): DraftAnswer {
  if (!v) return needsYou(q, `${missing(`${what} answer`)} Jobify fills it in automatically after that.`);
  if (q.kind === "text" || q.kind === "textarea") return { questionId: q.id, value: v === "yes" ? "Yes" : "No", source: "profile" };
  const opt = pickOption(q, v === "yes" ? /^\s*yes\b/i : /^\s*no\b/i);
  return opt ? { questionId: q.id, value: opt, source: "profile" } : needsYou(q, "Pick the option that matches your situation.");
}

function text(q: FormQuestion, v: string, missing: string): DraftAnswer {
  return v.trim()
    ? { questionId: q.id, value: v.trim(), source: "profile" }
    : needsYou(q, missing);
}

function selfIdAnswer(q: FormQuestion, s: SelfIdentification): DraftAnswer {
  const decline = (): DraftAnswer => {
    const opt = pickOption(q, DECLINE_RE);
    return opt
      ? { questionId: q.id, value: opt, source: "decline" }
      : needsYou(q, "Voluntary. Leave blank or choose for yourself.");
  };
  if (!s.optIn) return decline();
  const l = norm(`${q.id} ${q.label}`);
  let opt: string | null = null;
  if (/veteran/.test(l)) {
    if (s.veteran === "protected") opt = pickOption(q, /identify as|protected veteran/i);
    if (s.veteran === "not_protected") opt = pickOption(q, /not a protected veteran/i);
  } else if (/disab/.test(l)) {
    if (s.disability === "yes") opt = pickOption(q, /^\s*yes/i);
    if (s.disability === "no") opt = pickOption(q, /^\s*no/i);
  } else if (/hispanic|latino/.test(l)) {
    if (s.hispanicLatino === "yes") opt = pickOption(q, /^\s*yes/i);
    if (s.hispanicLatino === "no") opt = pickOption(q, /^\s*no/i);
  } else if (/gender|sex/.test(l)) {
    opt = s.gender ? pickOption(q, s.gender) : null;
  } else if (/race|ethnic/.test(l)) {
    opt = s.race ? pickOption(q, s.race) : null;
  }
  return opt ? { questionId: q.id, value: opt, source: "self_id" } : decline();
}

/**
 * Answer what the application profile covers. Returns null for questions that
 * need the resume (Claude). Self-identification and consent questions are
 * always answered here, never by Claude.
 */
export function answerFromProfile(q: FormQuestion, p: ApplicationProfile, selfId: SelfIdentification): DraftAnswer | null {
  if (q.section === "self_id") return selfIdAnswer(q, selfId);
  if (q.section === "consent") {
    return needsYou(q, "Your decision: Jobify never agrees or opts in on your behalf.");
  }
  if (q.kind === "file") {
    if (/resume|cv/i.test(`${q.id} ${q.label}`)) return { questionId: q.id, value: "resume", source: "attachment" };
    return needsYou(q, q.required ? "Required by this employer." : "Optional.");
  }

  const id = q.id;
  const l = norm(q.label);
  const loc = [p.city, p.state, p.country].filter(Boolean).join(", ");

  if (id === "first_name" || l === "first name") return text(q, p.firstName, missing("first name"));
  if (id === "last_name" || l === "last name") return text(q, p.lastName, missing("last name"));
  if (id === "preferred_name" || /preferred (first )?name/.test(l)) return { questionId: id, value: p.preferredName || p.firstName, source: "profile" };
  if (id === "email" || l === "email") return text(q, p.email, missing("email"));
  if (id === "phone" || /^phone/.test(l)) return text(q, p.phone, missing("phone number"));
  if (id === "location" || /city and state|what city|current location|where do you (currently )?(live|reside)/.test(l)) {
    if (q.kind === "select") {
      const opt = pickOption(q, p.city) ?? pickOption(q, p.state);
      return opt ? { questionId: id, value: opt, source: "profile" } : null;
    }
    return text(q, /city and state/.test(l) ? [p.city, p.state].filter(Boolean).join(", ") : loc, missing("city"));
  }
  if (/linkedin/.test(l) || id === "linkedin") return text(q, p.linkedin, missing("LinkedIn URL"));
  if (/github/.test(l)) return text(q, p.github, missing("GitHub URL"));
  if (/portfolio|website|personal site/.test(l) || id === "website") return text(q, p.portfolio || p.github, missing("portfolio or website"));
  if (/country/.test(l) && /resid|live|located/.test(l) && q.kind === "select") {
    const opt = p.country ? pickOption(q, p.country) : null;
    return opt ? { questionId: id, value: opt, source: "profile" } : needsYou(q, missing("country"));
  }
  if (/sponsor|visa|work permit/.test(l)) return yesNo(q, p.needsSponsorship, "sponsorship");
  if (/authori[sz]|legally (able|eligible)|right to work/.test(l)) return yesNo(q, p.workAuthorized, "work authorization");
  if (/relocat/.test(l)) return yesNo(q, p.willingToRelocate, "relocation");
  if (/salary|compensation|pay expectation/.test(l)) {
    return text(q, p.salaryExpectation, "Optional. Many people leave this blank or write \"Open to discussion\".");
  }
  if (/notice period|start date|when can you start|earliest.*start|availability/.test(l) && q.kind !== "select") {
    return text(q, p.availability, missing("availability"));
  }
  if (/how did you (hear|find|learn)/.test(l)) {
    if (q.kind === "select") {
      const opt = pickOption(q, p.howHeard) ?? pickOption(q, /career|website|job board|online/i);
      return opt ? { questionId: id, value: opt, source: "profile" } : null;
    }
    return text(q, p.howHeard, "");
  }
  if (id === "current_company" || /current or (most )?(recent|previous) (employer|company)|current (employer|company)/.test(l)) {
    if (p.currentCompany) return { questionId: id, value: p.currentCompany, source: "profile" };
    return null; // Claude can read it from the resume
  }
  if (id === "current_title" || /current or (most )?(recent|previous) (job )?title|current (job )?title/.test(l)) {
    if (p.currentTitle) return { questionId: id, value: p.currentTitle, source: "profile" };
    return null;
  }
  return null;
}
