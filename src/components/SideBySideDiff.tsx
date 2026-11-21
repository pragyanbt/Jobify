"use client";

import { diffLines, diffWordsWithSpace } from "diff";
import { useMemo, useState } from "react";
import { latexToText } from "@/lib/latex/document";
import { Segmented } from "./ui";

/** Original vs. tailored, side by side: deletions red on the left, additions green on the right. */
export function SideBySideDiff({ left, right, leftLabel, rightLabel }: {
  left: string;
  right: string;
  leftLabel: string;
  rightLabel: string;
}) {
  const [mode, setMode] = useState<"text" | "latex">("text");
  const parts = useMemo(() => {
    if (mode === "text") return diffWordsWithSpace(safeText(left), safeText(right));
    return diffLines(left, right);
  }, [left, right, mode]);
  const changed = parts.filter((p) => p.added || p.removed).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">{changed} changed segment(s)</span>
        <Segmented className="text-xs" value={mode} onChange={setMode} options={[["text", "Resume text"], ["latex", "LaTeX"]] as const} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Pane label={leftLabel}>
          {parts.map((p, i) => (p.added ? null : <span key={i} className={p.removed ? "diff-del" : ""}>{p.value}</span>))}
        </Pane>
        <Pane label={rightLabel}>
          {parts.map((p, i) => (p.removed ? null : <span key={i} className={p.added ? "diff-add" : ""}>{p.value}</span>))}
        </Pane>
      </div>
    </div>
  );
}

function safeText(latex: string) {
  try {
    return latexToText(latex);
  } catch {
    return latex;
  }
}

function Pane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
      <div className="border-b border-slate-100 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap p-3 [overflow-wrap:anywhere] font-mono text-[12px] leading-relaxed text-slate-800">{children}</pre>
    </div>
  );
}
