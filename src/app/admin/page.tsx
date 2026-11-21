"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, ErrorNote, Loading, PageHeader, Spinner, Stat } from "@/components/ui";
import { api } from "@/lib/fetcher";
import { timeAgo } from "@/lib/time";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  approvedAt: string | null;
  createdAt: string;
  masters: number;
  calls30d: number;
  cost30d: number;
  inputTokens30d: number;
  outputTokens30d: number;
};

type UsageSummary = {
  today: { cost: number; calls: number };
  last7: { cost: number; calls: number };
  last30: { cost: number; calls: number };
  byKind: { kind: string; cost: number; calls: number }[];
  recent: {
    id: string;
    userId: string;
    email: string;
    kind: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    createdAt: string;
  }[];
};

function money(n: number) {
  return `$${n.toFixed(n >= 1 ? 2 : 4)}`;
}

function statusTone(s: string): "slate" | "green" | "amber" | "red" | "indigo" {
  if (s === "active") return "green";
  if (s === "pending") return "amber";
  if (s === "paused") return "indigo";
  if (s === "banned") return "red";
  return "slate";
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [u, s] = await Promise.all([
        api<UserRow[]>("/api/admin/users"),
        api<UsageSummary>("/api/admin/usage"),
      ]);
      setUsers(u);
      setUsage(s);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(id: string, status: "active" | "paused" | "banned" | "pending") {
    setBusy(id + status);
    setError(null);
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", json: { status } });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!users && !error) return <Loading label="Loading admin dashboard…" />;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dev dashboard"
        description="Approve new accounts, watch Claude spend, and pause or ban users."
        actions={
          <Button onClick={() => void load()} disabled={!!busy}>
            Refresh
          </Button>
        }
      />
      <ErrorNote error={error} />

      {usage && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Spend today" value={money(usage.today.cost)} />
          <Stat label="Last 7 days" value={money(usage.last7.cost)} />
          <Stat label="Last 30 days" value={money(usage.last30.cost)} />
        </div>
      )}

      {usage && (
        <Card title="Claude usage" description="Estimated from token counts (Opus-tier rates by default).">
          <div className="mb-4 flex flex-wrap gap-2 text-sm text-slate-600">
            <span>{usage.today.calls} calls today</span>
            <span className="text-slate-300">·</span>
            <span>{usage.last7.calls} in 7d</span>
            <span className="text-slate-300">·</span>
            <span>{usage.last30.calls} in 30d</span>
          </div>
          <div className="mb-5 flex flex-wrap gap-2">
            {usage.byKind.map((k) => (
              <Badge key={k.kind} tone="slate">
                {k.kind}: {money(k.cost)} ({k.calls})
              </Badge>
            ))}
          </div>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
            {usage.recent.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-slate-500">No API calls recorded yet.</li>
            )}
            {usage.recent.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-900">{r.email || r.userId.slice(0, 8)}</div>
                  <div className="text-xs text-slate-500">
                    {r.kind} · {r.model} · {r.inputTokens.toLocaleString()} in / {r.outputTokens.toLocaleString()} out
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold tabular-nums">{money(r.costUsd)}</div>
                  <div className="text-xs text-slate-400">{timeAgo(r.createdAt)}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Users" description="New sign-ups stay pending until you approve them. Pause stops Claude calls." padded={false}>
        <ul className="divide-y divide-slate-100">
          {(users ?? []).map((u) => (
            <li key={u.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-slate-900">{u.email || u.id.slice(0, 8)}</span>
                  <Badge tone={statusTone(u.status)}>{u.status}</Badge>
                  {u.role === "admin" && <Badge tone="indigo">admin</Badge>}
                </div>
                <div className="text-xs text-slate-500">
                  Joined {timeAgo(u.createdAt)}
                  {u.approvedAt ? ` · approved ${timeAgo(u.approvedAt)}` : ""}
                  {" · "}
                  {u.masters} resume{u.masters === 1 ? "" : "s"}
                  {" · "}
                  {money(u.cost30d)} / {u.calls30d} calls (30d)
                </div>
              </div>
              {u.role !== "admin" && (
                <div className="flex flex-wrap gap-2">
                  {u.status === "pending" && (
                    <Button size="sm" variant="primary" disabled={!!busy} onClick={() => void setStatus(u.id, "active")}>
                      {busy === u.id + "active" ? <Spinner /> : null} Approve
                    </Button>
                  )}
                  {u.status === "active" && (
                    <Button size="sm" disabled={!!busy} onClick={() => void setStatus(u.id, "paused")}>
                      {busy === u.id + "paused" ? <Spinner /> : null} Pause
                    </Button>
                  )}
                  {u.status === "paused" && (
                    <Button size="sm" variant="primary" disabled={!!busy} onClick={() => void setStatus(u.id, "active")}>
                      {busy === u.id + "active" ? <Spinner /> : null} Resume
                    </Button>
                  )}
                  {u.status !== "banned" && (
                    <Button size="sm" variant="danger" disabled={!!busy} onClick={() => void setStatus(u.id, "banned")}>
                      {busy === u.id + "banned" ? <Spinner /> : null} Ban
                    </Button>
                  )}
                  {u.status === "banned" && (
                    <Button size="sm" variant="primary" disabled={!!busy} onClick={() => void setStatus(u.id, "active")}>
                      {busy === u.id + "active" ? <Spinner /> : null} Unban
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
          {users?.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-slate-500">No users yet.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
