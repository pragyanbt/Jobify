import { findBlockedCommands, latexToText, sectionTitles, splitDocument } from "./latex/document";
import { countTerm, weightedTerms } from "./scoring";
import type { JobAnalysis, TailoringRules, ValidationIssue } from "./types";

// Deterministic truthfulness/format checks. These run on every tailored
// version (AI-generated or user-edited) and are the hard gate for auto-apply.
// A complementary LLM fact-check (src/lib/ai/factcheck.ts) covers claims that
// can't be caught lexically (e.g. inflated scope or seniority).

export interface ValidationInput {
  masterLatex: string;
  tailoredLatex: string;
  /** Approved profile facts, joined as text. */
  factsText: string;
  analysis: JobAnalysis | null;
  rules: TailoringRules;
}

/** Numeric claims: 40%, $1.2M, 10x, 6+ years, 1,000, 99.9 ... */
const NUM_RE = /\$?\d[\d,]*(?:\.\d+)?\s?(?:%|\+|x\b|k\b|m\b|mm\b|b\b|ms\b)?/gi;

export function numericTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(NUM_RE)) {
    out.add(m[0].toLowerCase().replace(/[,\s]/g, ""));
  }
  return out;
}

export function validateDeterministic(input: ValidationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { masterLatex, tailoredLatex, factsText, analysis, rules } = input;

  // 1. Template preservation: the preamble must be byte-identical.
  try {
    const m = splitDocument(masterLatex);
    const t = splitDocument(tailoredLatex);
    if (m.preamble !== t.preamble) {
      issues.push({
        severity: "error",
        code: "preamble_changed",
        message: "The LaTeX preamble (packages, layout, macros) differs from the master resume.",
      });
    }
  } catch (e) {
    issues.push({ severity: "error", code: "preamble_changed", message: (e as Error).message });
    return issues;
  }

  const blocked = findBlockedCommands(tailoredLatex);
  if (blocked.length) {
    issues.push({
      severity: "error",
      code: "blocked_command",
      message: `Uses blocked LaTeX features: ${blocked.join(", ")}.`,
    });
  }

  const masterText = latexToText(masterLatex);
  const tailoredText = latexToText(tailoredLatex);
  const evidence = `${masterText}\n${factsText}`;

  // 2. No new skills/technologies that aren't in the master or approved facts.
  if (analysis) {
    for (const { term } of weightedTerms(analysis)) {
      if (countTerm(tailoredText, term) > 0 && countTerm(evidence, term) === 0) {
        issues.push({
          severity: "error",
          code: "unsupported_skill",
          message: `"${term.name}" appears in the tailored resume but not in your master resume or approved profile facts.`,
          detail: "Add it as an approved profile fact if it's genuinely part of your background.",
        });
      }
    }
  }

  // 3. No new numbers/metrics.
  const evNums = numericTokens(evidence);
  for (const n of numericTokens(tailoredText)) {
    if (!evNums.has(n)) {
      issues.push({
        severity: "error",
        code: "unsupported_number",
        message: `The figure "${n}" does not appear in your master resume or approved facts.`,
      });
    }
  }

  // 4. User rule: terms never to introduce.
  for (const raw of rules.neverAdd) {
    const term = { name: raw, aliases: [] };
    if (raw.trim() && countTerm(tailoredText, term) > countTerm(masterText, term)) {
      issues.push({
        severity: "error",
        code: "never_add",
        message: `"${raw}" is on your never-add list but was added.`,
      });
    }
  }

  // 5. Protected sections must survive.
  const tailoredSections = sectionTitles(tailoredLatex).map((s) => s.toLowerCase());
  for (const s of sectionTitles(masterLatex)) {
    const isProtected = rules.protectedSections.some((p) => p.toLowerCase() === s.toLowerCase());
    if (isProtected && !tailoredSections.includes(s.toLowerCase())) {
      issues.push({
        severity: "error",
        code: "protected_section",
        message: `Protected section "${s}" was removed.`,
      });
    }
  }

  return issues;
}
