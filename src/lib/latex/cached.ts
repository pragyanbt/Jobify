import { createHash } from "node:crypto";
import { compileLatex } from "./compile";
import { readPdf, savePdf } from "../storage";

/** Compile LaTeX, caching the PDF by content hash. */
export async function compileCached(prefix: string, latex: string) {
  const key = `${prefix}-${createHash("sha256").update(latex).digest("hex").slice(0, 24)}`;
  const hit = await readPdf(`${key}.pdf`);
  if (hit) return { ok: true as const, pdf: hit };
  const res = await compileLatex(latex);
  if (!res.ok || !res.pdf) return { ok: false as const, error: res.error?.message ?? "Compile failed", log: res.log };
  await savePdf(key, res.pdf);
  return { ok: true as const, pdf: res.pdf };
}

export function pdfResponse(pdf: Buffer, filename: string, download = false) {
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
    },
  });
}
