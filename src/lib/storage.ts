import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "data", "pdfs");

export async function savePdf(name: string, pdf: Buffer): Promise<string> {
  await fs.mkdir(ROOT, { recursive: true });
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, "");
  const file = path.join(ROOT, `${safe}.pdf`);
  await fs.writeFile(file, pdf);
  return `${safe}.pdf`;
}

export async function readPdf(rel: string): Promise<Buffer | null> {
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) return null;
  try {
    return await fs.readFile(file);
  } catch {
    return null;
  }
}
