import type { ReactNode } from "react";
import { IconCheck, Logo } from "./icons";

const POINTS = [
  "Tailors your resume to each job, without inventing anything",
  "Keeps your LaTeX template pixel-for-pixel",
  "Finds fresh postings from company career sites",
];

/** Full-screen frame for signed-out pages: brand panel on desktop, clean card on phones. */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-brand-900/30 blur-2xl" />
        <div className="relative flex items-center gap-2.5">
          <Logo size={36} tile />
          <span className="text-xl font-semibold tracking-tight">Jobify</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">A truthful resume for every job you apply to.</h2>
          <ul className="mt-8 space-y-4 text-[15px] text-white/90">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/20"><IconCheck className="size-3" strokeWidth={3} /></span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/60">Your data stays in your own account.</p>
      </div>

      <div className="flex flex-col px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-8">
        <div className="flex items-center gap-2 lg:hidden">
          <Logo size={40} />
          <span className="text-lg font-semibold tracking-tight">Jobify</span>
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
    </div>
  );
}
