"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, ErrorNote, Field, Loading, Notice, PageHeader, Spinner, StickyActionBar, Switch, Tabs } from "@/components/ui";
import { JunuAvatar } from "@/components/JunuAvatar";
import { IconCheck, IconPlus, IconTrash } from "@/components/icons";
import { ApplicationProfileCard } from "@/components/ApplicationProfileCard";
import { ConnectedAccountsCard } from "@/components/ConnectedAccountsCard";
import { api, useApi } from "@/lib/fetcher";
import type { LoadedProfile } from "@/lib/profile";
import type { FactCategory, ProfileFact } from "@/lib/types";

const CATEGORIES: FactCategory[] = ["skill", "experience", "project", "achievement", "certification", "education", "other"];

interface System {
  latexEngine: string | null;
  model: string;
  claudeConfigured: boolean;
  channels: { id: string; label: string; canAutoSubmit: boolean }[];
}

export default function SettingsPage() {
  const { data, error, setData } = useApi<LoadedProfile>("/api/profile");
  const { data: sys } = useApi<System>("/api/system");
  const [p, setP] = useState<LoadedProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Tabs follow the URL hash so links like /settings#autopilot open the right one.
  const [tab, setTab] = useState<"search" | "autopilot">("search");
  const [showDetails, setShowDetails] = useState(false);
  useEffect(() => {
    const sync = () => setTab(/^#(autopilot|application-profile)$/.test(window.location.hash) ? "autopilot" : "search");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (data) setP(data);
  }, [data]);

  async function save(next: LoadedProfile) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const saved = await api<LoadedProfile>("/api/profile", { method: "PUT", json: next });
      setData(saved);
      setMsg("Saved.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorNote error={error} />;
  if (!p) return <Loading />;
  const dirty = JSON.stringify(p) !== JSON.stringify(data);
  const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const js = p.jobSearch;
  const setJs = (patch: Partial<LoadedProfile["jobSearch"]>) => setP({ ...p, jobSearch: { ...js, ...patch } });
  const saveButton = (
    <Button variant="primary" disabled={!dirty || busy} onClick={() => save(p)}>
      {busy && <Spinner />}
      {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
    </Button>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description={tab === "autopilot" ? "Let Junu prepare applications for you." : "What to search for, and how your resume is tailored."}
        actions={<div className="hidden items-center gap-3 sm:flex">{msg && !dirty && <span className="text-sm text-neutral-600">{msg}</span>}{saveButton}</div>}
      />
      <Tabs
        value={tab}
        onChange={(t) => { setTab(t); window.history.replaceState(null, "", t === "autopilot" ? "#autopilot" : "#job-search"); }}
        tabs={[
          { id: "search", label: "Job search" },
          { id: "autopilot", label: <span className="flex items-center gap-1.5">Autopilot {p.autoApply.enabled && <span className="rounded-full bg-neutral-950 px-1.5 text-[11px] font-medium text-white">On</span>}</span> },
        ]}
      />
      <ErrorNote error={err} />

      {tab === "search" ? (
        <div className="space-y-5">
      {sys && (
        <div className="flex flex-wrap gap-2">
          <SysPill ok={sys.claudeConfigured} label="Claude" value={sys.claudeConfigured ? sys.model : "set ANTHROPIC_API_KEY"} />
          <SysPill ok={!!sys.latexEngine} label="LaTeX" value={sys.latexEngine ?? "not installed (brew install tectonic)"} />
          <SysPill ok label="Submit via" value={sys.channels.map((c) => c.label).join(", ")} />
        </div>
      )}

      <Card title={<span id="job-search" className="scroll-mt-24">Job search</span>} description="What to look for, where, and how often.">
        <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
          <div className="space-y-4">
            <Switch label="Search automatically" checked={js.enabled} onChange={(v) => setJs({ enabled: v })} />
            <Field label="Target job titles" hint="Comma-separated. A posting matches when its title contains all words of one entry. Engineer/developer and full-stack spellings count as the same.">
              <input className="input" defaultValue={js.keywords.join(", ")} placeholder="Java Developer, Full Stack Engineer"
                onBlur={(e) => setJs({ keywords: list(e.target.value) })} />
            </Field>
            <Field label="Skip titles containing" hint="Comma-separated.">
              <input className="input" defaultValue={js.excludeKeywords.join(", ")} placeholder="Senior, Manager"
                onBlur={(e) => setJs({ excludeKeywords: list(e.target.value) })} />
            </Field>
            <Field label="Locations" hint="Separate with semicolons. Leave empty for anywhere.">
              <input className="input" defaultValue={js.locations.join("; ")} placeholder="Dallas, TX; Austin, TX"
                onBlur={(e) => setJs({ locations: e.target.value.split(";").map((x) => x.trim()).filter(Boolean) })} />
            </Field>
            <Switch label="Include remote jobs" checked={js.includeRemote} onChange={(v) => setJs({ includeRemote: v })} />
            <Field label="Remote must be open to" hint="Comma-separated regions.">
              <input className="input" defaultValue={js.remoteRegions.join(", ")} placeholder="US, North America"
                onBlur={(e) => setJs({ remoteRegions: list(e.target.value) })} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label={<>Posted within <span className="font-normal text-slate-400">days</span></>}>
                <input type="number" inputMode="numeric" min={1} max={60} className="input" value={js.maxAgeDays}
                  onChange={(e) => setJs({ maxAgeDays: Number(e.target.value) })} />
              </Field>
              <Field label={<>Every <span className="font-normal text-slate-400">hours</span></>}>
                <input type="number" inputMode="numeric" min={0} max={168} className="input" value={js.intervalHours}
                  onChange={(e) => setJs({ intervalHours: Number(e.target.value) })} />
              </Field>
              <Field label="Max new">
                <input type="number" inputMode="numeric" min={1} max={500} className="input" value={js.maxNewPerRun}
                  onChange={(e) => setJs({ maxNewPerRun: Number(e.target.value) })} />
              </Field>
            </div>
          </div>
          <div className="space-y-4 border-t border-slate-100 pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <div>
              <div className="text-sm font-medium text-slate-800">Company career sites</div>
              <p className="hint">
                Add a company by the name in its careers URL, e.g. <code>boards.greenhouse.io/<b>stripe</b></code>,{" "}
                <code>jobs.lever.co/<b>palantir</b></code>, <code>jobs.ashbyhq.com/<b>ramp</b></code>.
              </p>
            </div>
            {(["greenhouse", "lever", "ashby"] as const).map((k) => (
              <Field key={k} label={<><span className="capitalize">{k}</span> <span className="font-normal text-slate-400">({js.sources[k].length})</span></>}>
                <textarea className="input min-h-16 font-mono text-xs sm:text-xs" defaultValue={js.sources[k].join(", ")} autoCapitalize="none" autoCorrect="off"
                  onBlur={(e) => setJs({ sources: { ...js.sources, [k]: list(e.target.value.toLowerCase()) } })} />
              </Field>
            ))}
            <Switch label="Remotive" description="Remote job board." checked={js.sources.remotive} onChange={(v) => setJs({ sources: { ...js.sources, remotive: v } })} />
            <Switch label="Adzuna" description="Broad US search. Needs a free key: set ADZUNA_APP_ID and ADZUNA_APP_KEY in .env.local." checked={js.sources.adzuna} onChange={(v) => setJs({ sources: { ...js.sources, adzuna: v } })} />
          </div>
        </div>
      </Card>

      <Card
        title="Profile facts"
        description="Tailoring can only use your master resume plus approved facts. Add things your resume leaves out; review extracted facts before approving."
        actions={
          <Button
            size="sm"
            onClick={() =>
              setP({
                ...p,
                facts: [...p.facts, { id: crypto.randomUUID(), category: "skill", text: "", approved: true, source: "user" }],
              })
            }
          >
            <IconPlus /> Add
          </Button>
        }
      >
        {p.facts.length === 0 && <p className="text-sm text-slate-500">No facts yet. Use <b>Extract facts</b> on a master resume, or add your own.</p>}
        <ul className="space-y-3">
          {p.facts.map((f, i) => {
            const upd = (patch: Partial<ProfileFact>) =>
              setP({ ...p, facts: p.facts.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <li key={f.id} className={`rounded-xl border p-3 ${f.approved ? "border-neutral-200" : "border-neutral-400 bg-neutral-50"}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select className="input sm:w-40" value={f.category} onChange={(e) => upd({ category: e.target.value as FactCategory })}>
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <input className="input flex-1" value={f.text} onChange={(e) => upd({ text: e.target.value })} placeholder="e.g. Kubernetes (deployed services to EKS at Acme, 2023)" />
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={f.approved} onChange={(e) => upd({ approved: e.target.checked })} /> Approved
                  </label>
                  {f.source === "extracted" && <Badge>extracted</Badge>}
                  <button className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950" onClick={() => setP({ ...p, facts: p.facts.filter((_, j) => j !== i) })}>
                    <IconTrash className="size-3.5" /> Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {p.facts.some((f) => !f.approved) && (
          <Button className="mt-3 w-full sm:w-auto" onClick={() => setP({ ...p, facts: p.facts.map((f) => ({ ...f, approved: true })) })}>
            <IconCheck /> Approve all ({p.facts.filter((f) => !f.approved).length})
          </Button>
        )}
      </Card>

      <Card title="Tailoring rules">
        <div className="space-y-4">
          <Switch label="Allow removing irrelevant content" checked={p.rules.allowRemoval} onChange={(v) => setP({ ...p, rules: { ...p.rules, allowRemoval: v } })} />
          <Field label="Target page count">
            <input type="number" inputMode="numeric" min={1} max={4} className="input w-24" value={p.rules.maxPages}
              onChange={(e) => setP({ ...p, rules: { ...p.rules, maxPages: Number(e.target.value) } })} />
          </Field>
          <Field label="Protected sections" hint="Comma-separated. These are never edited.">
            <input className="input" defaultValue={p.rules.protectedSections.join(", ")}
              onBlur={(e) => setP({ ...p, rules: { ...p.rules, protectedSections: list(e.target.value) } })} />
          </Field>
          <Field label="Never add these terms" hint="Comma-separated.">
            <input className="input" defaultValue={p.rules.neverAdd.join(", ")}
              onBlur={(e) => setP({ ...p, rules: { ...p.rules, neverAdd: list(e.target.value) } })} />
          </Field>
          <Field label="Extra instructions">
            <textarea className="input min-h-24" value={p.rules.instructions} placeholder="e.g. Keep a formal tone. Always keep my Wells Fargo bullets."
              onChange={(e) => setP({ ...p, rules: { ...p.rules, instructions: e.target.value } })} />
          </Field>
        </div>
      </Card>


          <ConnectedAccountsCard />
        </div>
      ) : (
      <div className="space-y-5">
        <Card padded>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50"><JunuAvatar size={40} /></div>
            <div className="min-w-0 flex-1">
              <Switch
                label={<span className="text-base font-semibold">Auto-apply with Junu</span>}
                description="Junu tailors your resume for new jobs that match well and fills in their applications, so they're ready for you to review and submit. Jobify never submits an application without you."
                checked={p.autoApply.enabled}
                onChange={(v) => setP({ ...p, autoApply: { ...p.autoApply, enabled: v } })}
              />
            </div>
          </div>
        </Card>

        {p.autoApply.enabled ? (
          <>
            <Card title="Autopilot rules" description="Which jobs Junu works on, and when you review.">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Min. match score" hint="0–100. Only jobs at or above this.">
                    <input type="number" inputMode="numeric" min={0} max={100} className="input" value={p.autoApply.minBaseScore}
                      onChange={(e) => setP({ ...p, autoApply: { ...p.autoApply, minBaseScore: Number(e.target.value) } })} />
                  </Field>
                  <Field label="Max jobs per day">
                    <input type="number" inputMode="numeric" min={0} max={100} className="input" value={p.autoApply.dailyLimit}
                      onChange={(e) => setP({ ...p, autoApply: { ...p.autoApply, dailyLimit: Number(e.target.value) } })} />
                  </Field>
                </div>
                <Field label="Review before it's ready">
                  <select className="input" value={p.autoApply.review}
                    onChange={(e) => setP({ ...p, autoApply: { ...p.autoApply, review: e.target.value as LoadedProfile["autoApply"]["review"] } })}>
                    <option value="always">Always: every application goes to my approval queue</option>
                    <option value="on_warnings">Only when validation has warnings</option>
                    <option value="never">Never: mark ready whenever validation passes</option>
                  </select>
                </Field>
                <p className="text-xs leading-relaxed text-slate-500">
                  Any validation error always sends an application to your review. Remember to save these rules.
                </p>
              </div>
            </Card>
            <Notice tone="info" title="Details Junu needs to fill in applications">
              Junu uses these to answer application forms for you. Fill in at least your name, contact details and work eligibility.
            </Notice>
            <ApplicationProfileCard />
          </>
        ) : (
          <Card padded>
            <div className="text-sm leading-relaxed text-slate-600">
              Turn on <b>Auto-apply with Junu</b> above and save to set it up. Junu will then ask for the details it needs to fill in
              applications (contact details, work eligibility, links).
            </div>
            {!showDetails ? (
              <button className="link mt-3 text-sm" onClick={() => setShowDetails(true)}>Fill in application details anyway</button>
            ) : (
              <div className="mt-4"><ApplicationProfileCard /></div>
            )}
          </Card>
        )}
      </div>
      )}

      {(dirty || msg) && (
        <StickyActionBar className="sm:hidden">
          <div className="flex items-center gap-3 [&>button]:flex-1">
            {msg && !dirty && <span className="text-sm text-neutral-600">{msg}</span>}
            {saveButton}
          </div>
        </StickyActionBar>
      )}
    </div>
  );
}

function SysPill({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <span className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1 text-xs ${ok ? "border-neutral-200 bg-white text-neutral-600" : "border-neutral-950 bg-white text-neutral-950"}`}>
      <span className={`size-1.5 shrink-0 rounded-full ${ok ? "bg-neutral-400" : "bg-neutral-950"}`} />
      <span className="font-medium text-slate-800">{label}</span>
      <span className="truncate">{value}</span>
    </span>
  );
}
