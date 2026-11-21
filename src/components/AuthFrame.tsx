import Image from "next/image";
import type { ReactNode } from "react";
import { IconCheck, Logo } from "./icons";
import { HOW_JUNU_WORKS as STEPS } from "./howJunuWorks";

/** Vertical step diagram: numbered nodes joined by a line. */
function Workflow() {
  return (
    <ol className="relative">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const last = i === STEPS.length - 1;
        return (
          <li key={s.title} className="relative flex items-center gap-3.5 pb-3 last:pb-0">
            {!last && <span className="absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-0.5 rounded bg-gradient-to-b from-brand-300 to-brand-200" aria-hidden />}
            <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-white text-slate-900 shadow-sm ring-1 ring-brand-200/80">
              <Icon className="size-[18px]" strokeWidth={2.1} />
              <span className="absolute -right-1.5 -top-1.5 grid size-[18px] place-items-center rounded-full bg-brand-600 text-[10px] font-bold text-white ring-2 ring-white">{i + 1}</span>
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight text-slate-900">{s.title}</div>
              <p className="mt-0.5 truncate text-[13px] leading-snug text-slate-600">{s.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Compact horizontal version for phones (under the form). */
function WorkflowCompact() {
  return (
    <div className="rounded-3xl bg-brand-50/70 p-4 ring-1 ring-brand-100">
      <div className="flex items-center gap-2.5">
        <Image src="/junu-face.png" alt="" width={36} height={36} className="size-9 shrink-0 rounded-full ring-2 ring-white" />
        <p className="text-sm font-semibold text-slate-900">How Junu works</p>
      </div>
      <ol className="mt-3 grid grid-cols-5 gap-1 text-center">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <li key={s.title} className="relative flex flex-col items-center gap-1.5">
              {i < STEPS.length - 1 && <span className="absolute left-[calc(50%+18px)] top-[18px] h-0.5 w-[calc(100%-36px)] bg-brand-200" aria-hidden />}
              <span className="relative grid size-9 place-items-center rounded-xl bg-white text-slate-900 shadow-sm ring-1 ring-brand-200/80">
                <Icon className="size-4" strokeWidth={2.1} />
              </span>
              <span className="text-[11px] font-medium leading-tight text-slate-700">{s.short}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Full-screen frame for signed-out pages: illustrated "how it works" panel on desktop, clean form on phones. */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-50 via-[#f6f2ff] to-white lg:block">
        {/* soft background shapes */}
        <div className="pointer-events-none absolute -right-32 -top-32 size-[28rem] rounded-full bg-brand-200/40 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-40 -left-24 size-[26rem] rounded-full bg-brand-100/70 blur-3xl" aria-hidden />

        <div className="sticky top-0 flex h-dvh flex-col justify-between gap-5 px-10 py-8 xl:px-14">
          <div className="relative flex items-center gap-2.5">
            <Logo size={36} />
            <span className="text-xl font-semibold tracking-tight text-slate-900">Jobify</span>
          </div>

          <div className="relative mx-auto w-full max-w-lg">
            <div className="flex items-end gap-5">
              <Image src="/junu.png" alt="Junu, your job search assistant" width={168} height={168} priority className="size-28 shrink-0 drop-shadow-xl [@media(min-height:860px)]:size-36" />
              <div className="relative mb-4 rounded-3xl rounded-bl-md bg-white px-4 py-3 shadow-[0_8px_30px_rgba(91,47,207,0.10)] ring-1 ring-brand-100">
                <p className="text-[15px] font-semibold text-slate-900">Hi, I&apos;m Junu 👋</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">I find jobs that fit you and get a truthful, tailored resume ready for each one.</p>
              </div>
            </div>

            <div className="mt-5 rounded-[28px] bg-white/80 p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/70 backdrop-blur">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">How Junu works</p>
              <Workflow />
              <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-900 bg-slate-100 px-3.5 py-2 text-[13px] font-medium text-slate-900">
                <IconCheck className="size-4 shrink-0" strokeWidth={2.5} />
                You review and approve every resume and application.
              </div>
            </div>
          </div>

          <p className="relative text-xs text-slate-500">Your data stays in your own account.</p>
        </div>
      </aside>

      <div className="flex flex-col px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10">
        <div className="flex items-center gap-2.5 lg:hidden">
          <Logo size={40} />
          <span className="text-lg font-semibold tracking-tight">Jobify</span>
        </div>
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-sm">
            {children}
            <div className="mt-10 lg:hidden"><WorkflowCompact /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
