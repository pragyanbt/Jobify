import { joinDocument, sanitizeReplacement, splitDocument } from "./document";
import type { ChangeKind, ChangeRecord } from "../types";

export interface ProposedEdit {
  kind: ChangeKind;
  find: string;
  replace: string;
  reason: string;
  evidence: string;
}

/**
 * Apply find/replace edits to the *body* of a LaTeX document, sequentially.
 * An edit is applied only if its `find` text occurs exactly once (exact match
 * first, then whitespace-insensitive). Ambiguous or missing targets are
 * rejected and recorded rather than guessed at. The preamble is never touched.
 */
export function applyEdits(
  latex: string,
  edits: ProposedEdit[],
): { latex: string; records: ChangeRecord[] } {
  const doc = splitDocument(latex);
  let body = doc.body;
  const records: ChangeRecord[] = [];

  for (const e of edits) {
    const base = {
      kind: e.kind,
      before: e.find,
      after: e.replace,
      reason: e.reason,
      evidence: e.evidence,
    };
    if (!e.find.trim()) {
      records.push({ ...base, status: "rejected", rejectReason: "Empty target text." });
      continue;
    }
    if (e.find.includes("\\begin{document}") || e.replace.includes("\\begin{document}") ||
        e.replace.includes("\\documentclass") || e.replace.includes("\\usepackage")) {
      records.push({ ...base, status: "rejected", rejectReason: "Edits may not touch the preamble." });
      continue;
    }

    const loc = locate(body, e.find);
    if (loc.kind === "none") {
      records.push({ ...base, status: "rejected", rejectReason: "Target text not found in resume." });
      continue;
    }
    if (loc.kind === "many") {
      records.push({ ...base, status: "rejected", rejectReason: "Target text is ambiguous (matches more than once)." });
      continue;
    }
    const original = body.slice(loc.start, loc.end);
    const replacement = sanitizeReplacement(original, e.replace);
    body = body.slice(0, loc.start) + replacement + body.slice(loc.end);
    records.push({ ...base, before: original, after: replacement, status: "applied" });
  }

  return { latex: joinDocument({ ...doc, body }), records };
}

type Loc = { kind: "none" } | { kind: "many" } | { kind: "one"; start: number; end: number };

function locate(haystack: string, needle: string): Loc {
  const first = haystack.indexOf(needle);
  if (first !== -1) {
    if (haystack.indexOf(needle, first + 1) !== -1) return { kind: "many" };
    return { kind: "one", start: first, end: first + needle.length };
  }
  // Whitespace-insensitive fallback: models often re-wrap long lines.
  const pattern = needle
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  if (!pattern) return { kind: "none" };
  const re = new RegExp(pattern, "g");
  const matches = [...haystack.matchAll(re)];
  if (matches.length === 0) return { kind: "none" };
  if (matches.length > 1) return { kind: "many" };
  const m = matches[0];
  return { kind: "one", start: m.index!, end: m.index! + m[0].length };
}
