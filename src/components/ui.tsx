"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode, type RefObject } from "react";
import { IconAlert, IconCheck, IconChevronLeft, IconInbox, IconInfo } from "./icons";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

// ------------------------------------------------------------------ layout

export function PageHeader({ title, description, back, actions, badges }: {
  title: ReactNode;
  description?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
  badges?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      {back && (
        <Link href={back.href} className="-ml-1 inline-flex items-center gap-0.5 rounded-md py-1 pr-2 text-sm text-slate-500 hover:text-slate-900">
          <IconChevronLeft width={16} height={16} /> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          {badges && <div className="mt-2 flex flex-wrap items-center gap-1.5">{badges}</div>}
          {description && <div className="mt-1 text-sm leading-relaxed text-slate-500">{description}</div>}
        </div>
        {actions && (
          <div className="flex flex-wrap gap-2 [&>*]:flex-1 sm:shrink-0 sm:[&>*]:flex-none">{actions}</div>
        )}
      </div>
    </div>
  );
}

export function Card({ title, description, actions, children, className = "", padded = true }: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={cx("rounded-xl border border-neutral-200 bg-white", className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={padded ? "p-4 sm:p-5" : ""}>{children}</div>
    </section>
  );
}

// ------------------------------------------------------------------ buttons

const VARIANTS = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300",
  secondary: "border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 hover:text-neutral-950 disabled:text-neutral-400 disabled:hover:bg-white",
  danger: "border border-neutral-300 bg-white text-neutral-950 hover:bg-neutral-100",
  ghost: "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950",
};
const SIZES = {
  md: "h-10 px-4 text-sm sm:h-9 sm:px-3.5",
  sm: "h-9 px-3 text-sm sm:h-8 sm:px-2.5 sm:text-[13px]",
};
type Variant = keyof typeof VARIANTS;
type Size = keyof typeof SIZES;

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra = "") {
  return cx(
    "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 [&_svg]:size-4 [&_svg]:shrink-0",
    SIZES[size],
    VARIANTS[variant],
    extra,
  );
}

export function Button({ variant = "secondary", size = "md", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return <button {...props} className={buttonClass(variant, size, className)} />;
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={cx("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)} aria-hidden />;
}

// ------------------------------------------------------------------ badges & status

const TONES = {
  slate: "bg-neutral-100 text-neutral-600 ring-neutral-200",
  green: "bg-neutral-950 text-white ring-neutral-950",
  amber: "bg-neutral-100 text-neutral-950 ring-neutral-300",
  red: "bg-white text-neutral-950 ring-neutral-950",
  indigo: "bg-neutral-100 text-neutral-800 ring-neutral-200",
};
type Tone = keyof typeof TONES;

export function Badge({ tone = "slate", children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone])}>
      {dot && <span className="size-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}

export const STATUS_TONE: Record<string, Tone> = {
  ready: "indigo",
  approved: "green",
  needs_review: "amber",
  failed: "red",
  error: "red",
  analyzed: "green",
  awaiting_approval: "amber",
  ready_manual: "indigo",
  submitted: "green",
  withdrawn: "slate",
  interview: "green",
  offer: "green",
  rejected: "red",
};

const STATUS_LABEL: Record<string, string> = {
  ready_manual: "ready to submit",
  awaiting_approval: "awaiting approval",
  needs_review: "needs review",
  submitted: "applied",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge dot tone={STATUS_TONE[status] ?? "slate"}>{STATUS_LABEL[status] ?? status.replace(/_/g, " ")}</Badge>;
}

/** A small circular score, color-coded. */
export function ScorePill({ score, from }: { score: number; from?: number }) {
  const s = Math.round(score);
  const tone = s >= 70 ? "text-neutral-950 bg-neutral-100 ring-neutral-300" : s >= 45 ? "text-neutral-700 bg-white ring-neutral-200" : "text-neutral-500 bg-neutral-50 ring-neutral-200";
  return (
    <span className="inline-flex items-center gap-1 text-xs tabular-nums">
      {from != null && <span className="text-slate-400">{Math.round(from)}% →</span>}
      <span className={cx("rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset", tone)}>{s}%</span>
    </span>
  );
}

export function ScoreBar({ label, score, muted }: { label: string; score: number; muted?: boolean }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span className="font-semibold tabular-nums text-slate-900">{score.toFixed(0)}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div
          className={cx("h-2 rounded-full transition-[width] duration-500", muted ? "bg-slate-400" : "bg-brand-600")}
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ feedback

const NOTICE = {
  info: { box: "border-neutral-200 bg-neutral-50 text-neutral-800", icon: IconInfo },
  success: { box: "border-neutral-200 bg-white text-neutral-950", icon: IconCheck },
  warning: { box: "border-neutral-300 bg-neutral-50 text-neutral-950", icon: IconAlert },
  error: { box: "border-neutral-950 bg-white text-neutral-950", icon: IconAlert },
  neutral: { box: "border-neutral-200 bg-neutral-50 text-neutral-700", icon: IconInfo },
};

export function Notice({ tone = "info", title, children, action }: {
  tone?: keyof typeof NOTICE;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const { box, icon: Icon } = NOTICE[tone];
  return (
    <div className={cx("flex gap-3 rounded-xl border px-3.5 py-3 text-sm", box)} role={tone === "error" ? "alert" : undefined}>
      <Icon className="mt-0.5 size-4 shrink-0 opacity-80" />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className="leading-relaxed [overflow-wrap:anywhere]">{children}</div>}
        {action && <div className="pt-1">{action}</div>}
      </div>
    </div>
  );
}

export function ErrorNote({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return <Notice tone="error">{error}</Notice>;
}

export function Empty({ children, title, icon, action }: { children?: ReactNode; title?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center">
      <div className="mb-3 grid size-11 place-items-center rounded-full bg-slate-100 text-slate-500 [&_svg]:size-5">
        {icon ?? <IconInbox />}
      </div>
      {title && <div className="font-medium text-slate-900">{title}</div>}
      {children && <div className="mt-1 max-w-sm text-sm leading-relaxed text-slate-500">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="space-y-4" aria-busy>
      <div className="h-7 w-48 animate-pulse rounded-lg bg-slate-200/70" />
      <div className="h-4 w-72 max-w-full animate-pulse rounded bg-slate-200/60" />
      <div className="h-40 animate-pulse rounded-2xl bg-slate-200/50" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

// ------------------------------------------------------------------ controls

export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: { id: T; label: ReactNode }[];
  value: T;
  onChange: (t: T) => void;
}) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition",
            value === t.id ? "border-brand-600 font-medium text-brand-700" : "border-transparent text-slate-500 hover:text-slate-900",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** iOS-style segmented control. */
export function Segmented<T extends string>({ options, value, onChange, className = "" }: {
  options: readonly (readonly [T, ReactNode])[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cx("inline-flex rounded-lg bg-slate-100 p-0.5 text-sm", className)} role="tablist">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={cx(
            "flex-1 whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition",
            value === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Toggle. `size="sm"` is the compact inline form (label before the toggle, no description). */
export function Switch({ checked, onChange, label, description, size = "md", title }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  size?: "md" | "sm";
  title?: string;
}) {
  const sm = size === "sm";
  const toggle = (
    <span className={cx("relative inline-flex shrink-0", !sm && "mt-0.5")}>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={cx("rounded-full bg-slate-300 transition peer-checked:bg-brand-600 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-500/25", sm ? "h-5 w-9" : "h-6 w-11")} />
      <span className={cx("absolute left-0.5 top-0.5 rounded-full bg-white shadow transition", sm ? "size-4 peer-checked:translate-x-4" : "size-5 peer-checked:translate-x-5")} />
    </span>
  );
  if (sm) {
    return (
      <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[13px] font-medium text-slate-700" title={title}>
        {toggle}
        {label}
      </label>
    );
  }
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-1" title={title}>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="hint">{description}</span>}
      </span>
      {toggle}
    </label>
  );
}

export function Field({ label, hint, children, className = "" }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Stat({ label, value, icon }: { label: string; value: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
        {label}
        {icon && <span className="text-slate-400 [&_svg]:size-4">{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</div>
    </div>
  );
}

/** Action bar pinned above the phone tab bar; inline (normal flow) from `sm` up. */
export function StickyActionBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("fixed inset-x-0 bottom-[var(--tabbar-h)] z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur", className)}>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ hooks

/** Calls `onClose` on a click outside `ref` while `open`. */
export function useClickOutside(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [ref, open, onClose]);
}

/** Live media-query match. False during server render. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
