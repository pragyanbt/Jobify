"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconChart, IconFile, IconHelp, IconHome, IconLogout, IconSend, IconSettings, IconSidebar, Logo } from "./icons";
import { ApplyPrompt } from "./ApplyPrompt";
import { JunuAvatar } from "./JunuAvatar";
import { Junu, openJunu } from "./Junu";
import { cx, useClickOutside } from "./ui";

const LINKS = [
  { href: "/home", label: "Home", short: "Home", icon: IconHome },
  { href: "/studio", label: "Resume Studio", short: "Resumes", icon: IconFile },
  { href: "/applications", label: "Applications", short: "Applied", icon: IconSend },
  { href: "/insights", label: "Insights", short: "Insights", icon: IconChart },
  { href: "/settings", label: "Settings", short: "Settings", icon: IconSettings },
];

function useActive() {
  const path = usePathname();
  // Job pages belong to Home.
  return (href: string) => path === href || path.startsWith(href + "/") || (href === "/home" && (path.startsWith("/jobs") || path.startsWith("/chat")));
}

const COLLAPSE_KEY = "jobify.sidebar.collapsed";

/** Signed-in chrome: sidebar on desktop; top bar + bottom tab bar on phones. */
export function AppShell({ email, children }: { email: string | null; children: ReactNode }) {
  const path = usePathname();
  const chat = path.startsWith("/chat");
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1"); } catch { /* storage unavailable */ }
  }, []);
  const toggle = () => setCollapsed((c) => {
    try { localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1"); } catch { /* storage unavailable */ }
    return !c;
  });

  if (email === null) {
    return <main className="min-h-dvh">{children}</main>;
  }
  return (
    <div className={cx("min-h-dvh transition-[padding] duration-200", collapsed ? "md:pl-[76px]" : "md:pl-64")}>
      <Sidebar email={email} collapsed={collapsed} onToggle={toggle} />
      <MobileTopBar email={email} />
      {chat ? (
        // Chat pages fill the space between the top bar and the tab bar (phones) or the window (desktop).
        <main className="fixed inset-x-0 bottom-[var(--tabbar-h)] top-[calc(3.5rem+1px+env(safe-area-inset-top))] flex flex-col md:static md:mx-auto md:h-dvh md:max-w-7xl md:px-8 md:py-6">
          {children}
        </main>
      ) : (
        <main className="mx-auto w-full max-w-7xl px-4 pb-[calc(var(--tabbar-h)+2rem)] pt-4 sm:px-6 md:px-8 md:pb-12 md:pt-6">
          {children}
        </main>
      )}
      <BottomTabs />
      <ApplyPrompt />
      <Junu />
    </div>
  );
}

function Sidebar({ email, collapsed, onToggle }: { email: string; collapsed: boolean; onToggle: () => void }) {
  const active = useActive();
  const item = (on: boolean) => cx(
    "flex items-center gap-3 rounded-xl text-[15px] transition",
    collapsed ? "size-11 justify-center" : "px-3.5 py-2.5",
    on ? "bg-white font-semibold text-slate-900 shadow-[0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70" : "font-medium text-slate-600 hover:bg-white/70 hover:text-slate-900",
  );

  return (
    <aside className={cx("fixed inset-y-0 left-0 z-30 hidden flex-col py-4 transition-[width] duration-200 md:flex", collapsed ? "w-[76px] items-center px-2.5" : "w-64 px-4")}>
      <div className={cx("flex items-center", collapsed ? "flex-col gap-3" : "justify-between pl-1.5")}>
        <Link href="/home" className="flex items-center gap-2.5" title="Jobify">
          <Logo size={32} />
          {!collapsed && <span className="text-[19px] font-bold tracking-tight text-slate-900">Jobify</span>}
        </Link>
        <button onClick={onToggle} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700" title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <IconSidebar className="size-[18px]" />
        </button>
      </div>

      <nav className={cx("mt-8 flex flex-1 flex-col gap-1", collapsed && "items-center")}>
        {LINKS.map((l) => {
          const on = active(l.href);
          const Icon = l.icon;
          return (
            <Link key={l.href} href={l.href} className={item(on)} title={collapsed ? l.label : undefined}>
              <Icon className={cx("size-5 shrink-0", on ? "text-brand-600" : "text-slate-500")} strokeWidth={on ? 2 : 1.7} />
              {!collapsed && l.label}
            </Link>
          );
        })}
      </nav>

      <div className={cx("flex flex-col gap-1", collapsed && "items-center")}>
        <button
          onClick={() => openJunu({ prompt: "What can you help me with in Jobify?" })}
          className={cx(item(false), "text-left text-sm")}
          title={collapsed ? "Help" : undefined}
        >
          <IconHelp className="size-5 shrink-0 text-slate-500" strokeWidth={1.7} />
          {!collapsed && "Help"}
        </button>
        <div className={cx("mt-2 border-t border-slate-200/80 pt-3", collapsed ? "w-full" : "")}>
          <div className={cx("flex items-center gap-3", collapsed ? "flex-col" : "px-1.5")}>
            <Avatar email={email} />
            {!collapsed && <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800" title={email}>{email || "Signed in"}</span>}
            <form action="/auth/signout" method="post">
              <button className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700" title="Sign out" aria-label="Sign out">
                <IconLogout className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}

function MobileTopBar({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useClickOutside(ref, open, () => setOpen(false));

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/home" className="flex items-center gap-2">
          <Logo size={32} />
          <span className="text-[17px] font-semibold tracking-tight">Jobify</span>
        </Link>
        <div className="flex items-center gap-2">
        {path !== "/home" && !path.startsWith("/chat") && <button
          onClick={() => openJunu()}
          className="flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 py-1 pl-1 pr-3 text-sm font-semibold text-brand-800 active:scale-95"
          aria-label="Ask Junu"
        >
          <JunuAvatar size={26} /> Junu
        </button>}
        <div ref={ref} className="relative">
          <button onClick={() => setOpen((o) => !o)} aria-label="Account" aria-expanded={open} className="rounded-full">
            <Avatar email={email} />
          </button>
          {open && (
            <div className="absolute right-0 top-11 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/10">
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="text-xs text-slate-500">Signed in as</div>
                <div className="truncate text-sm font-medium">{email || "your account"}</div>
              </div>
              <form action="/auth/signout" method="post">
                <button className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50">
                  <IconLogout className="size-4 text-slate-400" /> Sign out
                </button>
              </form>
            </div>
          )}
        </div>
        </div>
      </div>
    </header>
  );
}

function BottomTabs() {
  const active = useActive();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <div className="grid h-16 grid-cols-5">
        {LINKS.map((l) => {
          const on = active(l.href);
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cx("flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition", on ? "text-brand-700" : "text-slate-500")}
            >
              <span className={cx("grid h-7 w-11 place-items-center rounded-full transition", on && "bg-brand-50")}>
                <Icon className="size-[21px]" strokeWidth={on ? 2.1 : 1.8} />
              </span>
              {l.short}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function Avatar({ email }: { email: string }) {
  const letter = (email.trim()[0] ?? "?").toUpperCase();
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-semibold text-white">
      {letter}
    </span>
  );
}
