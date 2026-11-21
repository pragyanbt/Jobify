import { promises as fs } from "node:fs";
import path from "node:path";
import { importResume } from "./ai/operations";
import { findBlockedCommands, joinDocument, latexToText, splitDocument } from "./latex/document";
import { numericTokens } from "./validation";

// Turns an uploaded resume (.tex, .pdf, .docx, .txt/.md) into a master LaTeX
// document. Non-LaTeX formats are transcribed into templates/default.tex by
// Claude, then checked for faithfulness against the source text.

export type SourceFormat = "latex" | "pdf" | "docx" | "text";

export interface ImportNote {
  severity: "error" | "warning" | "info";
  message: string;
}

export interface ImportResult {
  latex: string;
  format: SourceFormat;
  notes: ImportNote[];
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function detectFormat(buf: Buffer, fileName: string): SourceFormat {
  const ext = path.extname(fileName).toLowerCase();
  const head = buf.subarray(0, 8);
  if (head.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
    if (ext === ".docx" || ext === "") return "docx";
    throw new Error("That looks like a ZIP file but isn't a .docx resume.");
  }
  if (head.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))) {
    throw new Error("Legacy .doc files aren't supported. In Word, use File → Save As → .docx (or export a PDF).");
  }
  if (ext === ".pdf" || ext === ".docx") throw new Error(`The file isn't a valid ${ext} document.`);
  const text = buf.toString("utf8");
  if (text.includes("\\begin{document}")) return "latex";
  return "text";
}

async function extractPdfText(buf: Buffer): Promise<{ text: string; pages: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return { text: text.trim(), pages: totalPages };
}

async function extractDocxText(buf: Buffer): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value.trim();
}

async function defaultTemplate() {
  return fs.readFile(path.join(process.cwd(), "templates", "default.tex"), "utf8");
}

/** Compare figures in the source vs. the transcription. */
export function checkTranscription(sourceText: string, latex: string): ImportNote[] {
  const notes: ImportNote[] = [];
  const src = numericTokens(sourceText);
  const out = numericTokens(latexToText(latex));
  const added = [...out].filter((n) => !src.has(n));
  const dropped = [...src].filter((n) => !out.has(n));
  if (added.length) {
    notes.push({
      severity: "error",
      message: `These figures appear in the converted resume but not in your file: ${added.join(", ")}. Check and correct them in the editor.`,
    });
  }
  if (dropped.length) {
    notes.push({
      severity: "warning",
      message: `These figures from your file may have been dropped during conversion: ${dropped.slice(0, 15).join(", ")}${dropped.length > 15 ? "…" : ""}.`,
    });
  }
  return notes;
}

export async function importResumeFile(buf: Buffer, fileName: string): Promise<ImportResult> {
  if (buf.length === 0) throw new Error("The file is empty.");
  if (buf.length > MAX_UPLOAD_BYTES) throw new Error("The file is larger than 10 MB.");
  const format = detectFormat(buf, fileName);

  if (format === "latex") {
    const latex = buf.toString("utf8");
    splitDocument(latex);
    return { latex, format, notes: [] };
  }

  const notes: ImportNote[] = [];
  let text: string;
  let pdfBase64: string | undefined;

  if (format === "pdf") {
    const { text: t, pages } = await extractPdfText(buf);
    text = t;
    pdfBase64 = buf.toString("base64");
    if (pages > 10) throw new Error(`This PDF has ${pages} pages; a resume upload is limited to 10.`);
    if (text.length < 50) {
      notes.push({
        severity: "warning",
        message: "This PDF has little or no selectable text (it may be scanned). Claude read it visually, but figures couldn't be cross-checked automatically. Review the result carefully.",
      });
    }
  } else if (format === "docx") {
    text = await extractDocxText(buf);
  } else {
    text = buf.toString("utf8").trim();
  }
  if (!pdfBase64 && text.length < 50) throw new Error("Couldn't find enough text in this file to import.");

  return finalize(await convertToLatex(text, pdfBase64), format, notes, text);
}

async function convertToLatex(text: string, pdfBase64?: string) {
  const template = splitDocument(await defaultTemplate());
  const { body } = await importResume({ templateBodyExample: template.body, text, pdfBase64 });
  const latex = joinDocument({ ...template, body: `\n${body.trim()}\n` });
  const blocked = findBlockedCommands(latex);
  if (blocked.length) throw new Error(`Conversion produced blocked LaTeX features: ${blocked.join(", ")}`);
  return { latex };
}

function finalize(conv: { latex: string }, format: SourceFormat, notes: ImportNote[], text: string): ImportResult {
  if (text.length >= 50) notes.push(...checkTranscription(text, conv.latex));
  notes.push({
    severity: "info",
    message: `Converted from ${format.toUpperCase()} into Jobify's ATS-friendly LaTeX template. Review it before tailoring.`,
  });
  return { latex: conv.latex, format, notes };
}

/** Plain text pasted into the UI goes through the same path. */
export async function importPlainTextResume(text: string): Promise<ImportResult> {
  return importResumeFile(Buffer.from(text, "utf8"), "resume.txt");
}
