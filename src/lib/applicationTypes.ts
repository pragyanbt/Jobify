// Application-form types and small helpers shared by the server (applicationForm,
// prepareApplication, Junu) and the review page. Client-safe: no server imports.

export type QuestionKind = "text" | "textarea" | "select" | "multiselect" | "file";
export type Section = "details" | "eligibility" | "questions" | "consent" | "attachments" | "self_id";

export interface FormQuestion {
  id: string;
  label: string;
  description?: string;
  required: boolean;
  kind: QuestionKind;
  options?: { label: string; value: string }[];
  section: Section;
}

export type AnswerSource =
  | "profile"     // from the application profile
  | "resume"      // supported by the resume or approved facts
  | "drafted"     // written by Junu from the resume; review the wording
  | "attachment"  // a file (the resume PDF)
  | "decline"     // self-identification left as "decline"
  | "self_id"     // from the user's opted-in self-identification
  | "user"        // typed or changed by the user
  | "needs_you";  // the user must answer

export interface DraftAnswer {
  questionId: string;
  /** Text, or option value(s) for select questions. */
  value: string | string[];
  source: AnswerSource;
  note?: string;
}

export function needsYou(q: Pick<FormQuestion, "id">, note: string): DraftAnswer {
  return { questionId: q.id, value: "", source: "needs_you", note };
}

/** Unanswered questions worth the user's attention: required ones, plus the core sections. */
export function needsAttention(q: FormQuestion, a: DraftAnswer | undefined): boolean {
  return (!a || a.source === "needs_you") && (q.required || ["details", "eligibility", "questions"].includes(q.section));
}

/** Display text for an answer (option labels for selects). */
export function answerText(q: FormQuestion, a: DraftAnswer | undefined): string {
  if (!a) return "";
  const vals = Array.isArray(a.value) ? a.value : [a.value];
  if (q.kind === "select" || q.kind === "multiselect") {
    return vals.map((v) => q.options?.find((o) => o.value === v)?.label ?? v).filter(Boolean).join(", ");
  }
  if (q.kind === "file") return a.source === "attachment" ? "Your resume (PDF)" : "";
  return vals.join(", ");
}
