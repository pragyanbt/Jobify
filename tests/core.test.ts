import { describe, expect, it } from "vitest";
import { applyEdits } from "@/lib/latex/edits";
import { findBlockedCommands, latexToText, sanitizeReplacement, splitDocument } from "@/lib/latex/document";
import { buildMatchReport, scoreText } from "@/lib/scoring";
import { numericTokens, validateDeterministic } from "@/lib/validation";
import { DEFAULT_RULES, type JobAnalysis } from "@/lib/types";

const MASTER = String.raw`\documentclass{article}
\usepackage{enumitem}
\newcommand{\expheader}[2]{\textbf{#1}\hfill #2}
\begin{document}
\section{Summary}
Backend developer building services in Java and Spring Boot.
% Hidden: Kubernetes expert
\section{Skills}
\textbf{Languages:} Python, Java, SQL
\section{Experience}
\expheader{Acme}{2020 -- 2023}
\begin{itemize}
\item Built REST APIs with Spring Boot.
\item Improved query performance by 40\% on PostgreSQL.
\end{itemize}
\section{Education}
B.S. Computer Science
\end{document}
`;

const ANALYSIS: JobAnalysis = {
  title: "Backend Engineer",
  company: "X",
  seniority: "Mid",
  summary: "",
  requiredSkills: [
    { name: "Java", aliases: [] },
    { name: "Spring Boot", aliases: ["Spring"] },
    { name: "Kubernetes", aliases: ["k8s"] },
  ],
  preferredSkills: [{ name: "PostgreSQL", aliases: ["Postgres"] }],
  atsKeywords: [{ name: "REST APIs", aliases: ["REST"], importance: 2 }],
  qualifications: [{ text: "BS in CS", required: true, kind: "education" }],
  minYearsExperience: 3,
  responsibilities: [],
};

describe("latex document helpers", () => {
  it("splits and preserves the preamble", () => {
    const d = splitDocument(MASTER);
    expect(d.preamble.endsWith("\\begin{document}")).toBe(true);
    expect(d.body).toContain("\\section{Summary}");
  });

  it("extracts text, drops comments and keeps macro args", () => {
    const t = latexToText(MASTER);
    expect(t).toContain("Acme");
    expect(t).toContain("40%");
    expect(t).not.toContain("Kubernetes"); // commented out
    expect(t).not.toContain("\\textbf");
  });

  it("escapes bare specials the model introduced, but not existing ones", () => {
    expect(sanitizeReplacement("R and D", "R & D")).toBe("R \\& D");
    expect(sanitizeReplacement("a & b", "a & c")).toBe("a & c");
    expect(sanitizeReplacement("x", "50\\% faster")).toBe("50\\% faster");
  });

  it("blocks dangerous commands", () => {
    expect(findBlockedCommands("\\immediate\\write18{rm -rf /}")).not.toHaveLength(0);
    expect(findBlockedCommands("\\input{/etc/passwd}")).not.toHaveLength(0);
    expect(findBlockedCommands("\\input{../secret}")).not.toHaveLength(0);
    expect(findBlockedCommands("\\input{glyphtounicode}")).toHaveLength(0);
    expect(findBlockedCommands("% \\write18 in a comment")).toHaveLength(0);
  });
});

describe("applyEdits", () => {
  it("applies unique exact edits and leaves the preamble intact", () => {
    const { latex, records } = applyEdits(MASTER, [
      { kind: "skills", find: "Python, Java, SQL", replace: "Java, SQL, Python", reason: "", evidence: "" },
    ]);
    expect(records[0].status).toBe("applied");
    expect(latex).toContain("Java, SQL, Python");
    expect(splitDocument(latex).preamble).toBe(splitDocument(MASTER).preamble);
  });

  it("matches across re-wrapped whitespace", () => {
    const { records } = applyEdits(MASTER, [
      { kind: "summary", find: "Backend developer   building\nservices", replace: "Backend engineer building services", reason: "", evidence: "" },
    ]);
    expect(records[0].status).toBe("applied");
  });

  it("rejects missing, ambiguous and preamble edits", () => {
    const { latex, records } = applyEdits(MASTER, [
      { kind: "other", find: "not present", replace: "x", reason: "", evidence: "" },
      { kind: "other", find: "\\item", replace: "\\item!", reason: "", evidence: "" },
      { kind: "other", find: "Java", replace: "Java\\usepackage{evil}", reason: "", evidence: "" },
    ]);
    expect(records.map((r) => r.status)).toEqual(["rejected", "rejected", "rejected"]);
    expect(latex).toBe(MASTER);
  });
});

describe("scoring", () => {
  it("weights required skills and matches aliases on word boundaries", () => {
    const s = scoreText(latexToText(MASTER), ANALYSIS);
    const hit = (t: string) => s.hits.find((h) => h.term === t)!;
    expect(hit("Java").matched).toBe(true);
    expect(hit("Kubernetes").matched).toBe(false);
    expect(hit("PostgreSQL").matched).toBe(true);
    // Java, Spring Boot, PostgreSQL, REST APIs matched: (3+3+1.5+2)/(3*3+1.5+2)
    expect(s.score).toBeCloseTo((9.5 / 12.5) * 100, 0);
    expect(scoreText("javascript developer", ANALYSIS).hits.find((h) => h.term === "Java")!.matched).toBe(false);
  });

  it("reports missing requirements only when unsupported by facts", () => {
    const text = latexToText(MASTER);
    const r = buildMatchReport(text, text, `${text}\n- [skill] Kubernetes`, ANALYSIS);
    expect(r.missing).not.toContain("Kubernetes");
    const r2 = buildMatchReport(text, text, text, ANALYSIS);
    expect(r2.missing).toContain("Kubernetes");
  });
});

describe("validation", () => {
  const run = (tailored: string, facts = "") =>
    validateDeterministic({ masterLatex: MASTER, tailoredLatex: tailored, factsText: facts, analysis: ANALYSIS, rules: DEFAULT_RULES });

  it("passes a faithful rewrite", () => {
    const t = MASTER.replace("Python, Java, SQL", "Java, SQL, Python");
    expect(run(t)).toEqual([]);
  });

  it("flags a fabricated skill unless it's an approved fact", () => {
    const t = MASTER.replace("Python, Java, SQL", "Java, Kubernetes, SQL");
    expect(run(t).map((i) => i.code)).toContain("unsupported_skill");
    expect(run(t, "- [skill] Kubernetes")).toEqual([]);
  });

  it("flags fabricated metrics", () => {
    const t = MASTER.replace("by 40\\%", "by 65\\%");
    const issues = run(t);
    expect(issues.some((i) => i.code === "unsupported_number" && i.message.includes("65%"))).toBe(true);
  });

  it("flags preamble changes and removed protected sections", () => {
    const pre = MASTER.replace("\\usepackage{enumitem}", "\\usepackage{enumitem}\\usepackage{xcolor}");
    expect(run(pre).map((i) => i.code)).toContain("preamble_changed");
    const noEdu = MASTER.replace("\\section{Education}\nB.S. Computer Science\n", "");
    expect(run(noEdu).map((i) => i.code)).toContain("protected_section");
  });

  it("tokenizes numbers consistently", () => {
    expect([...numericTokens("40% of 1,000 users, 6+ years, $2.5M")]).toEqual(
      expect.arrayContaining(["40%", "1000", "6+", "$2.5m"]),
    );
  });
});
