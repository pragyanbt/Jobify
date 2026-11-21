// Helpers for treating a LaTeX resume as (preamble | body | postamble).
// Tailoring only ever touches the body; the preamble (packages, macros,
// geometry) is preserved byte-for-byte and validated as such.

const BEGIN = "\\begin{document}";
const END = "\\end{document}";

export interface SplitDoc {
  preamble: string; // everything up to and including \begin{document}
  body: string;
  postamble: string; // \end{document} and anything after
}

export function splitDocument(latex: string): SplitDoc {
  const b = latex.indexOf(BEGIN);
  const e = latex.lastIndexOf(END);
  if (b === -1 || e === -1 || e < b) {
    throw new Error("Not a complete LaTeX document: missing \\begin{document} or \\end{document}.");
  }
  const bodyStart = b + BEGIN.length;
  return {
    preamble: latex.slice(0, bodyStart),
    body: latex.slice(bodyStart, e),
    postamble: latex.slice(e),
  };
}

export function joinDocument(d: SplitDoc): string {
  return d.preamble + d.body + d.postamble;
}

/** Remove LaTeX comments (unescaped % to end of line). */
export function stripComments(src: string): string {
  return src
    .split("\n")
    .map((line) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] === "%" && !isEscaped(line, i)) return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

function isEscaped(s: string, i: number): boolean {
  let n = 0;
  for (let j = i - 1; j >= 0 && s[j] === "\\"; j--) n++;
  return n % 2 === 1;
}

/**
 * Best-effort LaTeX → plain text for keyword scoring and evidence checks.
 * Keeps macro *arguments* (so \textbf{Java} → Java, \expheader{A}{B} → A B)
 * and drops URLs, environment names, and formatting commands.
 */
export function latexToText(src: string): string {
  let s = stripComments(src);
  if (s.includes(BEGIN)) s = splitDocument(s).body;
  s = s
    .replace(/\\href\{[^}]*\}/g, "") // drop URL arg, keep display text
    .replace(/\\(begin|end)\{[^}]*\}(\[[^\]]*\])?/g, " ")
    .replace(/\\(vspace|hspace|setlength|addtolength)\*?\{[^}]*\}(\{[^}]*\})?/g, " ")
    .replace(/\\\\(\[[^\]]*\])?/g, "\n")
    .replace(/\\([&%$#_{}])/g, "$1")
    .replace(/\\textbullet/g, "•")
    .replace(/\\(item|hfill|noindent|centering|par|newline|titlerule|small|large|Large|LARGE|footnotesize|normalsize|bfseries|itshape|quad|qquad)\b/g, " ")
    .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?/g, " ")
    .replace(/\$[^$]*\$/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/~/g, " ")
    .replace(/---?/g, "-")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

/** Section headings present in a body (from \section{...}). */
export function sectionTitles(src: string): string[] {
  const out: string[] = [];
  const re = /\\section\*?\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripComments(src)))) out.push(m[1].trim());
  return out;
}

/**
 * Escape LaTeX specials that an LLM commonly emits bare in prose. Only
 * escapes a character when the original text it replaces had no bare use
 * of it (so tabular `&` and math `$` in the template are left alone).
 */
export function sanitizeReplacement(find: string, replace: string): string {
  let out = replace;
  for (const ch of ["&", "%", "#"]) {
    if (!hasBare(find, ch) && hasBare(out, ch)) {
      out = escapeBare(out, ch);
    }
  }
  return out;
}

function hasBare(s: string, ch: string): boolean {
  for (let i = 0; i < s.length; i++) if (s[i] === ch && !isEscaped(s, i)) return true;
  return false;
}

function escapeBare(s: string, ch: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    out += s[i] === ch && !isEscaped(s, i) ? "\\" + ch : s[i];
  }
  return out;
}

/**
 * Commands we refuse to compile regardless of engine flags (defence in depth
 * on top of the engine's own untrusted/no-shell-escape mode).
 */
const BLOCKED: { re: RegExp; why: string }[] = [
  { re: /\\write18|\\immediate\s*\\write/, why: "shell escape / file writes" },
  { re: /\\(openout|openin|read)\b/, why: "raw file I/O" },
  { re: /\\directlua|\\luaexec|\\usepackage(\[[^\]]*\])?\{shellesc\}/, why: "Lua / shell execution" },
  { re: /\\(input|include|InputIfFileExists|lstinputlisting|verbatiminput)\s*\{\s*(\/|~|[^}]*\.\.)/, why: "reading files outside the sandbox" },
];

export function findBlockedCommands(latex: string): string[] {
  const src = stripComments(latex);
  return BLOCKED.filter((b) => b.re.test(src)).map((b) => b.why);
}
