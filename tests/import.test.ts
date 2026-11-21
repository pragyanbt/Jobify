import { describe, expect, it } from "vitest";
import { checkTranscription, detectFormat } from "@/lib/resumeImport";

describe("detectFormat", () => {
  it("detects by content, not just extension", () => {
    expect(detectFormat(Buffer.from("%PDF-1.7 ..."), "resume.pdf")).toBe("pdf");
    expect(detectFormat(Buffer.from("%PDF-1.7 ..."), "renamed.txt")).toBe("pdf");
    expect(detectFormat(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]), "cv.docx")).toBe("docx");
    expect(detectFormat(Buffer.from("\\documentclass{article}\\begin{document}x\\end{document}"), "cv.tex")).toBe("latex");
    expect(detectFormat(Buffer.from("Jane Doe\nEngineer"), "cv.txt")).toBe("text");
  });

  it("rejects legacy .doc, fake PDFs/DOCX, and other zips", () => {
    expect(() => detectFormat(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1]), "cv.doc")).toThrow(/Legacy \.doc/);
    expect(() => detectFormat(Buffer.from("not a pdf"), "cv.pdf")).toThrow(/valid \.pdf/);
    expect(() => detectFormat(Buffer.from("plain"), "cv.docx")).toThrow(/valid \.docx/);
    expect(() => detectFormat(Buffer.from([0x50, 0x4b, 0x03, 0x04]), "photos.zip")).toThrow(/ZIP/);
  });
});

describe("checkTranscription", () => {
  const latex = (body: string) => `\\documentclass{article}\\begin{document}\n${body}\n\\end{document}`;

  it("passes a faithful transcription", () => {
    expect(checkTranscription("Cut latency by 40% across 3 services (2021-2023)", latex("Cut latency by 40\\% across 3 services (2021--2023)"))).toEqual([]);
  });

  it("flags figures that were invented or dropped", () => {
    const notes = checkTranscription("Cut latency by 40% for 1,200 users", latex("Cut latency by 45\\% for users"));
    expect(notes.find((n) => n.severity === "error")?.message).toContain("45%");
    expect(notes.find((n) => n.severity === "warning")?.message).toMatch(/40%.*1200|1200.*40%/);
  });
});
