"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Dispatch on window to make every mounted useApi() reload. */
export const REFRESH_EVENT = "jobify:refresh";

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.json !== undefined && { "Content-Type": "application/json" }), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Fetch JSON, optionally polling while `poll(data)` returns true. */
export function useApi<T>(url: string | null, opts: { poll?: (d: T) => boolean; intervalMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef(opts.poll);
  pollRef.current = opts.poll;

  const reload = useCallback(async () => {
    if (!url) return;
    try {
      setData(await api<T>(url));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [url]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Junu (or anything else) can ask every open list to refresh after changing data.
  useEffect(() => {
    const onRefresh = () => void reload();
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(REFRESH_EVENT, onRefresh);
  }, [reload]);

  useEffect(() => {
    if (!data || !pollRef.current?.(data)) return;
    const t = setTimeout(reload, opts.intervalMs ?? 2000);
    return () => clearTimeout(t);
  }, [data, reload, opts.intervalMs]);

  return { data, error, reload, setData };
}
