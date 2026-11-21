import { z } from "zod";

const Term = z.object({
  name: z.string().describe("Canonical name, as a recruiter would write it"),
  aliases: z.array(z.string()).describe("Common spelling variants/abbreviations, e.g. 'JS' for JavaScript"),
});

export const JobAnalysisSchema = z.object({
  title: z.string(),
  company: z.string(),
  seniority: z.string().describe("e.g. Entry, Mid, Senior, Staff, Lead"),
  summary: z.string().describe("Two-sentence summary of what the role is about"),
  requiredSkills: z.array(Term).describe("Skills/technologies explicitly required"),
  preferredSkills: z.array(Term).describe("Nice-to-have skills/technologies"),
  atsKeywords: z
    .array(Term.extend({ importance: z.number().describe("1 (minor) to 3 (central)") }))
    .describe("Other terms an ATS would likely match on (domains, methodologies, tools) not already listed as skills"),
  qualifications: z.array(
    z.object({
      text: z.string(),
      required: z.boolean(),
      kind: z.string().describe("education | experience | certification | authorization | other"),
    }),
  ),
  minYearsExperience: z.number().nullable(),
  responsibilities: z.array(z.string()),
});

export const EditKind = z.enum(["summary", "skills", "reorder", "bullet", "remove", "keyword", "other"]);

export const TailorSchema = z.object({
  summaryOfChanges: z.string().describe("3-6 sentence plain-English summary of what changed and why"),
  edits: z.array(
    z.object({
      kind: EditKind,
      find: z.string().describe("EXACT contiguous text copied from the resume body to replace"),
      replace: z.string().describe("Replacement LaTeX"),
      reason: z.string().describe("Why this helps for this job"),
      evidence: z
        .string()
        .describe("Verbatim quote(s) from the master resume or approved facts that support every claim in `replace`"),
    }),
  ),
});

export const FactCheckSchema = z.object({
  findings: z.array(
    z.object({
      changeIndex: z.number(),
      supported: z.boolean(),
      issue: z.string().describe("Empty if supported; otherwise what is unsupported or exaggerated"),
    }),
  ),
});

export const LatexFixSchema = z.object({
  diagnosis: z.string(),
  edits: z.array(z.object({ find: z.string(), replace: z.string() })),
});

export const FactExtractSchema = z.object({
  facts: z.array(
    z.object({
      category: z.enum(["skill", "experience", "project", "achievement", "certification", "education", "other"]),
      text: z.string(),
    }),
  ),
});

export const ImportSchema = z.object({
  body: z.string().describe("LaTeX for the document body only (no preamble, no \\begin{document})"),
});

export const JobPageSchema = z.object({
  isJobPosting: z.boolean().describe("False if the page isn't a single job posting (login wall, search results, error page)"),
  title: z.string(),
  company: z.string(),
  location: z.string().describe("As stated; empty if not stated"),
  remote: z.boolean(),
  description: z
    .string()
    .describe("The posting's full description copied verbatim (responsibilities, requirements, benefits), without site navigation, cookie banners or footers"),
});

export const ApplicationAnswersSchema = z.object({
  answers: z.array(
    z.object({
      id: z.string().describe("The question id, exactly as given"),
      basis: z
        .enum(["resume", "drafted", "unknown"])
        .describe(
          "resume = a fact stated in the resume/approved facts; drafted = a written answer composed only from those facts; " +
            "unknown = the materials don't support an answer, so the user must answer",
        ),
      text: z.string().describe("For text questions: the answer. Empty when basis is unknown or the question is a select"),
      options: z
        .array(z.string())
        .describe("For select questions: the chosen option label(s), copied exactly from the list. Empty otherwise or when unknown"),
      note: z.string().describe("One short sentence for the user: the evidence used, or what they need to decide. May be empty"),
    }),
  ),
});

export const EmailTriageSchema = z.object({
  emails: z.array(
    z.object({
      id: z.string().describe("The email id, exactly as given"),
      kind: z
        .enum(["application_received", "viewed", "interview", "assessment", "rejection", "offer", "recruiter", "other", "unrelated"])
        .describe(
          "application_received = confirmation an application was submitted; viewed = employer viewed it; interview = invitation " +
            "or scheduling of an interview/call; assessment = coding test or take-home; rejection = not moving forward; offer = " +
            "job offer; recruiter = a recruiter reaching out about a role; other = about the user's own job applications but none " +
            "of these; unrelated = newsletters, job alerts/recommendations, marketing, or anything not about the user's own applications",
        ),
      company: z.string().describe("Hiring company's name as written; empty if unclear"),
      job_title: z.string().describe("Role title if stated; empty otherwise"),
      summary: z.string().describe("One short factual sentence for the user, e.g. 'Acme invited you to a 30-minute phone screen next week.' Empty if unrelated"),
    }),
  ),
});
