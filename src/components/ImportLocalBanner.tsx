"use client";

import { useState } from "react";
import { Button, ErrorNote, Notice, Spinner } from "@/components/ui";
import { api, useApi } from "@/lib/fetcher";
import type { LocalCounts } from "@/lib/importLocal";

/** Offers to move data created before sign-in into the account (shown once). */
export function ImportLocalBanner({ onImported }: { onImported: () => void }) {
  const { data, reload } = useApi<{ available: LocalCounts | null }>("/api/import-local");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const c = data?.available;

  if (done) return <Notice tone="success">{done}</Notice>;
  if (!c) return null;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ imported: LocalCounts }>("/api/import-local", { method: "POST" });
      setDone(
        `Imported ${r.imported.masters} resume(s), ${r.imported.jobs} job(s), ${r.imported.tailored} tailored resume(s) and ${r.imported.applications} application(s) into your account.`,
      );
      await reload();
      onImported();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Notice
        tone="info"
        title="Import your earlier data?"
        action={<Button variant="primary" size="sm" onClick={run} disabled={busy}>{busy && <Spinner />}{busy ? "Importing…" : "Import my data"}</Button>}
      >
        Found data from before you signed in: <b>{c.masters}</b> resume(s), <b>{c.jobs}</b> job(s), <b>{c.tailored}</b> tailored
        resume(s), <b>{c.applications}</b> application(s).
      </Notice>
      <ErrorNote error={error} />
    </div>
  );
}
