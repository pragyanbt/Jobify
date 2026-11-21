"use client";

import { IconExternal, IconFile } from "./icons";

/**
 * Embedded PDF with an "Open" link. Phone browsers often render only the first page of an
 * embedded PDF (or nothing), so the link opens the full PDF in the native viewer.
 */
export function PdfPreview({ src, title, height = "70vh" }: { src: string | null; title: string; height?: string }) {
  if (!src) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500"
        style={{ height: `min(${height}, 420px)` }}
      >
        <IconFile className="size-6 text-slate-400" />
        No PDF yet: the document hasn&apos;t compiled successfully.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <span className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{title}</span>
        <a href={src} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
          Open <IconExternal className="size-3.5" />
        </a>
      </div>
      <iframe
        key={src}
        src={`${src}#toolbar=0&view=FitH`}
        title={title}
        className="block w-full bg-slate-100"
        style={{ height: `clamp(420px, ${height}, 1200px)` }}
      />
    </div>
  );
}
