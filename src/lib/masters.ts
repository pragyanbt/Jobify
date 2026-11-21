import { prisma } from "./db";
import { findBlockedCommands } from "./latex/document";
import type { ImportResult } from "./resumeImport";

export async function createMaster(userId: string, name: string, r: ImportResult) {
  const blocked = findBlockedCommands(r.latex);
  if (blocked.length) throw new Error(`Resume uses blocked LaTeX features: ${blocked.join(", ")}`);
  const count = await prisma.masterResume.count({ where: { userId } });
  return prisma.masterResume.create({
    data: {
      userId,
      name,
      latex: r.latex,
      isDefault: count === 0,
      sourceFormat: r.format,
      importNotes: JSON.stringify(r.notes),
    },
  });
}
