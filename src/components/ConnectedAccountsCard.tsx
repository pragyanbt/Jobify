"use client";

import { useEffect, useState } from "react";
import { api, useApi } from "@/lib/fetcher";
import { timeAgo } from "@/lib/time";
import { IconRefresh } from "./icons";
import { Badge, Button, buttonClass, Card, ErrorNote, Notice, Spinner } from "./ui";

interface Integrations {
  google: { configured: boolean; connected: boolean; accountEmail?: string; lastSyncAt?: string | null; lastError?: string | null };
}

function GmailMark() {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path fill="#4285F4" d="M2 6.5V18a1.5 1.5 0 0 0 1.5 1.5H6V10l-4-3.5z" />
        <path fill="#34A853" d="M18 19.5h2.5A1.5 1.5 0 0 0 22 18V6.5L18 10z" />
        <path fill="#EA4335" d="M6 10v-4.6l6 4.6 6-4.6V10l-6 4.6z" />
        <path fill="#FBBC04" d="M18 5.4V10l4-3.5V5.2c0-1.4-1.6-2.2-2.7-1.3z" />
        <path fill="#C5221F" d="M6 5.4V10L2 6.5V5.2c0-1.4 1.6-2.2 2.7-1.3z" />
      </svg>
    </span>
  );
}

/** Settings → Connected accounts: read-only Gmail. */
export function ConnectedAccountsCard() {
  const { data, error, reload } = useApi<Integrations>("/api/integrations");
  const [busy, setBusy] = useState<"sync" | "disconnect" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Result of the Google redirect (?gmail=connected / ?gmail_error=…).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("gmail") === "connected") setMsg("Gmail connected. Checking for application updates now…");
    if (p.get("gmail_error")) setErr(p.get("gmail_error"));
    if (p.has("gmail") || p.has("gmail_error")) window.history.replaceState(null, "", `/settings${window.location.hash}`);
  }, []);

  async function syncNow() {
    setBusy("sync");
    setErr(null);
    setMsg(null);
    try {
      const r = await api<{ updates: number }>("/api/inbox/sync", { method: "POST" });
      setMsg(r.updates ? `Found ${r.updates} new update(s). See them on Home.` : "No new application emails.");
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect Gmail? Jobify's access is revoked at Google, and the updates it found are deleted.")) return;
    setBusy("disconnect");
    setErr(null);
    try {
      await api("/api/integrations/google/disconnect", { method: "POST" });
      setMsg("Gmail disconnected and access revoked.");
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorNote error={error} />;
  const g = data?.google;

  return (
    <Card
      title={<span id="connections" className="scroll-mt-24">Connected accounts</span>}
      description="Junu reads application updates from your email. Access is read-only: Jobify can never send, delete or change mail."
    >
      <div className="space-y-4">
        {msg && <Notice tone="success">{msg}</Notice>}
        <ErrorNote error={err} />

        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <GmailMark />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">Gmail</span>
                {g?.connected ? <Badge tone="green" dot>Connected</Badge> : <Badge>Not connected</Badge>}
              </div>
              <div className="mt-0.5 truncate text-xs text-slate-500">
                {g?.connected
                  ? <>{g.accountEmail} · {g.lastSyncAt ? `checked ${timeAgo(g.lastSyncAt)}` : "first check running…"} · checks every 3 hours</>
                  : "Interview invites, rejections, offers and application confirmations"}
              </div>
            </div>
          </div>
          {!data ? (
            <Spinner className="text-slate-400" />
          ) : g?.connected ? (
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button size="sm" onClick={syncNow} disabled={!!busy}>{busy === "sync" ? <Spinner /> : <IconRefresh />} Check now</Button>
              <Button size="sm" variant="danger" onClick={disconnect} disabled={!!busy}>{busy === "disconnect" && <Spinner />} Disconnect</Button>
            </div>
          ) : g?.configured ? (
            <a href="/api/integrations/google/connect" className={buttonClass("primary", "sm")}>Connect Gmail</a>
          ) : null}
        </div>
        {g?.connected && g.lastError && <Notice tone="warning" title="Last check failed">{g.lastError}</Notice>}

        {data && !g?.configured && (
          <Notice tone="info" title="One-time setup to connect Gmail">
            <ol className="mt-1 list-decimal space-y-1 pl-4">
              <li>In <a className="underline" href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Google Cloud Console</a>, create a project and enable the <b>Gmail API</b>.</li>
              <li>OAuth consent screen: User type <b>External</b>, add your own email as a test user, then <b>Publish app</b> (so access doesn&apos;t expire every 7 days). Google shows an &ldquo;unverified app&rdquo; warning once; that&apos;s expected for a personal app.</li>
              <li>Credentials → Create OAuth client ID → <b>Web application</b>. Authorized redirect URI: <code className="break-all">http://localhost:3000/api/integrations/google/callback</code></li>
              <li>Paste the client ID and secret into <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in <code>.env.local</code>, then restart Jobify.</li>
            </ol>
          </Notice>
        )}

      </div>
    </Card>
  );
}
