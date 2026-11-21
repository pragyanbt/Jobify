import { AsyncLocalStorage } from "node:async_hooks";

/** Per-request context so Claude calls can attribute usage to a user. */
export type RequestContext = { userId: string };

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithUser<T>(userId: string, fn: () => T): T {
  return storage.run({ userId }, fn);
}

export function currentUserId(): string | null {
  return storage.getStore()?.userId ?? null;
}
