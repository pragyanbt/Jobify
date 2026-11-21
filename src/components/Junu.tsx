"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { REFRESH_EVENT } from "@/lib/fetcher";
import {
  IconArrowLeft,
  IconCheck,
  IconChevronDown,
  IconClock,
  IconSend,
} from "./icons";
import { JunuAvatar } from "./JunuAvatar";
import { cx, Spinner, Switch, useClickOutside } from "./ui";

// Junu: the in-app assistant. One continuous conversation (its history is the
// chat itself), the chat page, and the chat box on Home. Streams from POST /api/junu.

export const OPEN_JUNU_EVENT = "jobify:open-junu";

/** Open the chat from anywhere, optionally sending a message. */
export function openJunu(opts: { prompt?: string } = {}) {
  window.dispatchEvent(new CustomEvent(OPEN_JUNU_EVENT, { detail: opts }));
}

interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools?: string[];
  error?: boolean;
}

const STORE = "jobify.junu.v3";
const V2_STORE = "jobify.junu.v2";
const V1_STORE = "jobify.junu.v1";
/** Messages kept in the browser; Junu itself sees the most recent turns. */
const MAX_MSGS = 300;
const CONTEXT_TURNS = 30;

const SUGGESTIONS = [
  "Find new jobs for me",
  "Which of my jobs fit me best?",
  "Tailor my resume for my best match",
  "Prepare my application for my best match",
];

const uid = () => Math.random().toString(36).slice(2);

// ------------------------------------------------------------------ shared store
// One store for the whole app: the Home chat box and the chat page both read
// it, and a reply keeps streaming if you navigate away.

interface JunuState {
  msgs: Msg[];
  busy: boolean;
  activity: string | null;
  /** "Ask before acting": Junu proposes changes and waits for the user's OK. */
  confirmFirst: boolean;
}

const CONFIRM_KEY = "jobify.junu.confirmFirst";
const INITIAL: JunuState = {
  msgs: [],
  busy: false,
  activity: null,
  confirmFirst: false,
};
let state = INITIAL;
let loaded = false;
const listeners = new Set<() => void>();

function setState(patch: Partial<JunuState>) {
  const prev = state;
  state = { ...state, ...patch };
  // Save the conversation once a reply is complete (not on every streamed chunk or unrelated change).
  if (!state.busy && (state.msgs !== prev.msgs || prev.busy)) persist();
  listeners.forEach((l) => l());
}

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    state = {
      ...state,
      confirmFirst: localStorage.getItem(CONFIRM_KEY) === "1",
    };
    const raw = JSON.parse(localStorage.getItem(STORE) ?? "null") as {
      msgs?: Msg[];
    } | null;
    if (raw && Array.isArray(raw.msgs)) {
      state = {
        ...state,
        msgs: raw.msgs.filter((m) => m && typeof m.text === "string"),
      };
      return;
    }
    // Earlier versions kept separate chats: merge them, oldest first, into the one history.
    const v2 = JSON.parse(localStorage.getItem(V2_STORE) ?? "null") as {
      convos?: { updatedAt: number; msgs: Msg[] }[];
    } | null;
    const v1 = JSON.parse(localStorage.getItem(V1_STORE) ?? "[]") as Msg[];
    const merged = [
      ...(Array.isArray(v1) ? v1 : []),
      ...(v2?.convos ?? [])
        .slice()
        .sort((a, b) => a.updatedAt - b.updatedAt)
        .flatMap((c) => c.msgs ?? []),
    ].filter((m) => m && typeof m.text === "string" && !m.error);
    if (merged.length) {
      state = { ...state, msgs: merged.slice(-MAX_MSGS) };
      localStorage.setItem(STORE, JSON.stringify({ msgs: state.msgs }));
    }
    localStorage.removeItem(V2_STORE);
    localStorage.removeItem(V1_STORE);
  } catch {
    /* storage unavailable */
  }
}

function persist() {
  try {
    localStorage.setItem(
      STORE,
      JSON.stringify({
        msgs: state.msgs.filter((m) => !m.error).slice(-MAX_MSGS),
      }),
    );
  } catch {
    /* storage unavailable: the chat just isn't remembered */
  }
}

function subscribe(l: () => void) {
  ensureLoaded();
  listeners.add(l);
  return () => listeners.delete(l);
}

function useJunu() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL,
  );
}

function setConfirmFirst(v: boolean) {
  try {
    localStorage.setItem(CONFIRM_KEY, v ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
  setState({ confirmFirst: v });
}

async function sendToJunu(text: string, page: string | null) {
  const content = text.trim();
  if (!content || state.busy) return;

  const user: Msg = { id: uid(), role: "user", text: content };
  const reply: Msg = { id: uid(), role: "assistant", text: "", tools: [] };
  const kept = state.msgs
    .filter((m) => !m.error && m.text)
    .slice(-(MAX_MSGS - 2));
  setState({ msgs: [...kept, user, reply], busy: true, activity: "Thinking" });
  // Junu sees the most recent part of the conversation.
  const context = [...kept, user].slice(-CONTEXT_TURNS);

  const patch = (fn: (m: Msg) => Msg, extra: Partial<JunuState> = {}) =>
    setState({
      msgs: state.msgs.map((m) => (m.id === reply.id ? fn(m) : m)),
      ...extra,
    });
  let changed = false;
  try {
    const res = await fetch("/api/junu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: context.map(({ role, text: c }) => ({ role, content: c })),
        page,
        confirmFirst: state.confirmFirst,
      }),
    });
    if (!res.ok || !res.body) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Junu couldn't respond (${res.status}).`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const ev = JSON.parse(line) as
          | { type: "text"; text: string }
          | { type: "tool"; label: string }
          | { type: "effect" }
          | { type: "done" }
          | { type: "error"; message: string };
        if (ev.type === "text") {
          patch(
            (m) => ({
              ...m,
              text: m.text ? `${m.text}\n\n${ev.text}` : ev.text,
            }),
            { activity: "Thinking" },
          );
        } else if (ev.type === "tool") {
          patch((m) => ({ ...m, tools: [...(m.tools ?? []), ev.label] }), {
            activity: ev.label,
          });
        } else if (ev.type === "effect") {
          changed = true;
        } else if (ev.type === "error") {
          patch((m) => ({ ...m, text: ev.message, error: true }));
        }
      }
    }
  } catch (e) {
    patch((m) => ({
      ...m,
      text: (e as Error).message || "Junu couldn't respond.",
      error: true,
    }));
  } finally {
    setState({ busy: false, activity: null });
    if (changed) window.dispatchEvent(new Event(REFRESH_EVENT));
  }
}

const isDesktop = () => window.matchMedia("(min-width: 768px)").matches;

// ------------------------------------------------------------------ navigation + launcher

/** Where the user was before opening the chat, so Junu knows the context ("tailor this one"). */
let lastPage: string | null = null;

/**
 * Mounted once in the app shell. Turns openJunu() calls into navigation to the
 * chat pages, sending the prompt with the page the user came from. Also shows
 * the desktop "Ask Junu" launcher on pages without Home's chat box.
 */
export function Junu() {
  const path = usePathname();
  const router = useRouter();
  const { busy } = useJunu();
  const onChat = path.startsWith("/chat");

  useEffect(() => {
    if (!path.startsWith("/chat")) lastPage = path;
  }, [path]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const { prompt } = (e as CustomEvent<{ prompt?: string }>).detail ?? {};
      if (prompt) void sendToJunu(prompt, onChat ? lastPage : path);
      router.push("/chat");
    };
    window.addEventListener(OPEN_JUNU_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_JUNU_EVENT, onOpen);
  }, [path, onChat, router]);

  if (onChat || path === "/home") return null;
  return (
    <button
      onClick={() => openJunu()}
      className="fixed bottom-6 right-6 z-40 hidden items-center gap-2 rounded-full border border-neutral-200 bg-white py-1.5 pl-1.5 pr-4 text-sm font-medium text-neutral-950 shadow-sm md:flex"
      aria-label="Ask Junu"
    >
      <span className="relative">
        <JunuAvatar size={36} />
        {busy && (
          <span className="absolute -right-0.5 -top-0.5 size-2.5 animate-pulse rounded-full bg-brand-500 ring-2 ring-white" />
        )}
      </span>
      {busy ? "Junu is working…" : "Ask Junu"}
    </button>
  );
}

function useBack() {
  const router = useRouter();
  return (fallback = "/home") => {
    if (window.history.length > 1) router.back();
    else router.push(fallback);
  };
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="grid size-10 shrink-0 place-items-center rounded-full text-slate-600 hover:bg-slate-100"
      aria-label="Back"
      title="Back"
    >
      <IconArrowLeft className="size-5" />
    </button>
  );
}

// ------------------------------------------------------------------ chat pages

const PAGE_FRAME =
  "flex h-full min-h-0 flex-col bg-white md:overflow-hidden md:rounded-2xl md:border md:border-neutral-200";

/** /chat: the conversation with Junu, in the main area. */
export function JunuChatPage() {
  const back = useBack();
  const { busy, activity, msgs } = useJunu();
  return (
    <div className={PAGE_FRAME}>
      <header className="flex items-center gap-2 border-b border-slate-100 px-2 py-2.5 md:px-4 md:py-3">
        <BackButton onClick={() => back()} />
        <JunuTitle busy={busy} activity={activity} />
      </header>
      <Messages
        msgs={msgs}
        busy={busy}
        activity={activity}
        onSuggest={(t) => void sendToJunu(t, lastPage)}
      />
      <Composer page={lastPage} autoFocus variant="panel" />
    </div>
  );
}

// ------------------------------------------------------------------ Home composer

const QUICK = [
  { label: "Find new jobs", prompt: "Find new jobs for me" },
  {
    label: "Tailor for my best match",
    prompt: "Tailor my resume for my best match",
  },
];
const MORE_IDEAS = [
  "Prepare my application for my best match",
  "Which of my jobs fit me best, and why?",
  "What have I applied to so far?",
  "What skills do my target jobs keep asking for?",
  "Update my job search",
];

/** Junu's chat box, floating at the bottom of Home. Sending opens the chat. */
export function JunuComposer() {
  const { busy, activity, msgs, confirmFirst } = useJunu();
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const ask = (prompt: string) => {
    setMore(false);
    openJunu({ prompt });
  };

  useClickOutside(moreRef, more, () => setMore(false));

  return (
    <div className="sticky bottom-[calc(var(--tabbar-h)+0.75rem)] z-20 mt-6 md:bottom-5">
      <div className="mx-auto max-w-4xl rounded-2xl border border-neutral-200 bg-white p-3 sm:p-4">
        {busy && (
          <button
            onClick={() => openJunu()}
            className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium text-brand-700"
          >
            <Spinner className="size-3" /> Junu: {activity ?? "Working"}…{" "}
            <span className="underline">View</span>
          </button>
        )}
        <Composer page="/home" variant="bar" />
        <div className="mt-3 flex items-center gap-2">
          <Switch
            size="sm"
            checked={confirmFirst}
            onChange={setConfirmFirst}
            title="Junu describes changes and waits for your OK"
            label={
              <>
                <span className="hidden sm:inline">Ask before acting</span>
                <span className="sm:hidden">Ask first</span>
              </>
            }
          />
          <span className="hidden h-5 w-px bg-slate-200 sm:block" />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {QUICK.map((q) => (
              <button
                key={q.label}
                onClick={() => ask(q.prompt)}
                disabled={busy}
                className="hidden shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-700 transition hover:border-brand-300 hover:bg-brand-50/50 disabled:opacity-50 sm:block"
              >
                {q.label}
              </button>
            ))}
            <div ref={moreRef} className="relative shrink-0">
              <button
                onClick={() => setMore((m) => !m)}
                disabled={busy}
                className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-700 transition hover:border-brand-300 disabled:opacity-50"
                aria-expanded={more}
              >
                <span className="sm:hidden">Ideas</span>
                <span className="hidden sm:inline">More ideas</span>{" "}
                <IconChevronDown className="size-3.5" />
              </button>
              {more && (
                <div className="absolute bottom-full left-0 z-30 mb-2 w-[min(20rem,calc(100vw-3rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-xl">
                  {[...QUICK.map((q) => q.prompt), ...MORE_IDEAS].map(
                    (p, i) => (
                      <button
                        key={p}
                        onClick={() => ask(p)}
                        className={cx(
                          "block w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-brand-50/60",
                          i < QUICK.length && "sm:hidden",
                        )}
                      >
                        {p}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => openJunu()}
            className="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-100"
            aria-label="Chat history"
          >
            <IconClock className="size-4" />
            <span className="hidden sm:inline">Chat history</span>
            {msgs.length > 0 && (
              <span
                className="size-1.5 rounded-full bg-brand-500"
                aria-label="Has messages"
              />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function JunuTitle({
  busy,
  activity,
}: {
  busy: boolean;
  activity: string | null;
}) {
  return (
    <>
      <JunuAvatar size={40} className="self-center" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold leading-tight text-slate-900">Junu</div>
        <div className="flex items-center gap-1.5 truncate text-xs text-slate-500">
          {busy ? (
            <>
              <Spinner className="size-3 text-brand-600" />{" "}
              {activity ?? "Working"}…
            </>
          ) : (
            <>
              <span className="size-1.5 rounded-full bg-neutral-950" /> Your job
              search assistant
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Messages({
  msgs,
  busy,
  activity,
  onSuggest,
}: {
  msgs: Msg[];
  busy: boolean;
  activity: string | null;
  onSuggest: (s: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, activity]);

  return (
    <div
      ref={listRef}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5"
    >
      {msgs.length === 0 ? (
        <div className="flex min-h-full flex-col items-center justify-center text-center">
          <JunuAvatar size={128} full />
          <h2 className="mt-4 text-xl font-semibold tracking-tight">
            Hi, I&apos;m Junu
          </h2>
          <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-500">
            I can find jobs, tailor your resume, prepare applications, and keep
            your applications up to date.
          </p>
          <div className="mt-6 grid w-full max-w-sm gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => onSuggest(s)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 transition hover:border-brand-300 hover:bg-brand-50/50"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2.5 text-[15px] leading-relaxed text-white [overflow-wrap:anywhere] md:text-sm">
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex gap-2.5">
                <JunuAvatar size={28} className="mt-0.5" />
                <div className="min-w-0 flex-1 space-y-2">
                  {m.tools && m.tools.length > 0 && (
                    <ul className="space-y-1">
                      {m.tools.map((t, k) => {
                        const running =
                          busy &&
                          i === msgs.length - 1 &&
                          k === m.tools!.length - 1 &&
                          activity === t;
                        return (
                          <li
                            key={k}
                            className="flex items-center gap-1.5 text-xs text-slate-500"
                          >
                            {running ? (
                              <Spinner className="size-3 text-neutral-950" />
                            ) : (
                              <IconCheck className="size-3.5 text-neutral-950" />
                            )}
                            {t}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {m.text ? (
                    <div
                      className={cx(
                        "w-fit max-w-full rounded-2xl rounded-tl-md px-3.5 py-2.5 text-[15px] leading-relaxed [overflow-wrap:anywhere] md:text-sm",
                        m.error
                          ? "border border-neutral-950 bg-white text-neutral-950"
                          : "bg-neutral-100 text-neutral-800",
                      )}
                    >
                      <Markdown text={m.text} />
                    </div>
                  ) : busy && i === msgs.length - 1 && !m.tools?.length ? (
                    <div className="inline-flex gap-1 rounded-2xl rounded-tl-md bg-slate-100 px-4 py-3.5">
                      {[0, 150, 300].map((d) => (
                        <span
                          key={d}
                          className="size-1.5 animate-bounce rounded-full bg-slate-400"
                          style={{ animationDelay: `${d}ms` }}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** Message input. In the panel it sends in place; on Home it sends and opens the chat. */
function Composer({
  page,
  autoFocus,
  variant,
}: {
  page: string | null;
  autoFocus?: boolean;
  variant: "panel" | "bar";
}) {
  const { busy } = useJunu();
  const [input, setInput] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && isDesktop()) ref.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(
      el.scrollHeight,
      variant === "bar" ? 120 : 160,
    )}px`;
  }, [input, variant]);

  const send = () => {
    const t = input.trim();
    if (!t || busy) return;
    setInput("");
    if (variant === "bar") openJunu({ prompt: t });
    else void sendToJunu(t, page);
  };

  const box = (
    <div
      className={cx(
        "flex items-end gap-2.5 transition",
        variant === "bar"
          ? "px-1"
          : "rounded-2xl border border-slate-300 bg-white py-1.5 pl-3.5 pr-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15",
      )}
    >
      {variant === "bar" && <JunuAvatar size={34} className="mb-0.5" />}
      <textarea
        ref={ref}
        rows={1}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            !e.shiftKey &&
            !e.nativeEvent.isComposing &&
            isDesktop()
          ) {
            e.preventDefault();
            send();
          }
        }}
        placeholder={variant === "bar" ? "Ask Junu anything…" : "Message Junu…"}
        className={cx(
          "max-h-40 flex-1 resize-none bg-transparent py-1.5 text-base outline-none placeholder:text-slate-400",
          variant === "bar" ? "md:text-[15px]" : "md:text-sm",
        )}
      />
      <button
        type="button"
        onClick={send}
        disabled={busy || !input.trim()}
        className={cx(
          "grid size-9 shrink-0 place-items-center bg-brand-600 text-white transition hover:bg-brand-700 disabled:bg-slate-100 disabled:text-slate-400",
          variant === "bar" ? "rounded-full" : "rounded-xl",
        )}
        aria-label="Send"
      >
        {busy ? (
          <Spinner className="size-4" />
        ) : (
          <IconSend className="size-4" />
        )}
      </button>
    </div>
  );

  if (variant === "bar") return box;
  return (
    <div className="border-t border-slate-100 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
      {box}
      <p className="mt-1.5 text-center text-[11px] text-slate-400">
        Junu can make mistakes. Review tailored resumes and answers before you
        use them.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ minimal, safe markdown

/** Renders **bold**, [links](/path), and "- " / "1. " lists. Everything else is plain text (no HTML). */
function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag
        key={blocks.length}
        className={cx(
          "space-y-1 pl-5",
          list.ordered ? "list-decimal" : "list-disc",
          "marker:text-slate-400",
        )}
      >
        {list.items.map((it, i) => (
          <li key={i}>{inline(it)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const ordered = !!ol;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((ul ?? ol)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    blocks.push(
      <p key={blocks.length} className={heading ? "font-semibold" : undefined}>
        {inline(heading ? heading[1] : line)}
      </p>,
    );
  }
  flush();
  return <div className="space-y-2">{blocks}</div>;
}

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const k = out.length;
    if (m[1] !== undefined) {
      const href = m[2];
      if (/^\/(?!\/)/.test(href)) {
        out.push(
          <Link
            key={k}
            href={href}
            className="font-medium text-brand-700 underline decoration-brand-300 underline-offset-2 hover:decoration-brand-600"
          >
            {m[1]}
          </Link>,
        );
      } else if (/^https?:\/\//i.test(href)) {
        out.push(
          <a
            key={k}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-700 underline decoration-brand-300 underline-offset-2"
          >
            {m[1]}
          </a>,
        );
      } else {
        out.push(m[1]);
      }
    } else if (m[3] !== undefined) {
      out.push(
        <strong key={k} className="font-semibold text-slate-900">
          {m[3]}
        </strong>,
      );
    } else {
      out.push(
        <code key={k} className="rounded bg-white/70 px-1 text-[0.9em]">
          {m[4]}
        </code>,
      );
    }
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
