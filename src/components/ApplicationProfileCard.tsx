"use client";

import { useEffect, useState } from "react";
import type { ApplicationProfile, SelfIdentification } from "@/lib/applyProfile";
import { api, useApi } from "@/lib/fetcher";
import { Button, Card, ErrorNote, Field, Notice, Spinner, Switch } from "./ui";

interface Data {
  profile: ApplicationProfile;
  selfId: SelfIdentification;
  missing: string[];
}

const YN = [["", "Not set"], ["yes", "Yes"], ["no", "No"]] as const;

/** Settings → Application profile: answers Junu uses to fill in application forms. */
export function ApplicationProfileCard() {
  const { data, error, setData } = useApi<Data>("/api/application-profile");
  const [p, setP] = useState<ApplicationProfile | null>(null);
  const [sid, setSid] = useState<SelfIdentification | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) { setP(data.profile); setSid(data.selfId); }
  }, [data]);

  if (error) return <ErrorNote error={error} />;
  if (!p || !sid || !data) return <div className="h-40 animate-pulse rounded-2xl bg-slate-200/50" />;

  const dirty = JSON.stringify(p) !== JSON.stringify(data.profile) || JSON.stringify(sid) !== JSON.stringify(data.selfId);
  const set = (k: keyof ApplicationProfile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setSaved(false);
    setP({ ...p, [k]: e.target.value });
  };
  const setS = (patch: Partial<SelfIdentification>) => { setSaved(false); setSid({ ...sid, ...patch }); };

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const next = await api<Data>("/api/application-profile", { method: "PUT", json: { profile: p, selfId: sid } });
      setData(next);
      setSaved(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = (k: keyof ApplicationProfile, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <Field label={label} hint={hint}>
      <input className="input" value={p[k]} onChange={set(k)} {...extra} />
    </Field>
  );
  const yesNo = (k: "workAuthorized" | "needsSponsorship" | "willingToRelocate", label: string) => (
    <Field label={label}>
      <select className="input" value={p[k]} onChange={set(k)}>
        {YN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </Field>
  );

  return (
    <Card
      title={<span id="application-profile" className="scroll-mt-24">Application profile</span>}
      description="Junu uses these to fill in application forms for you. They're never used for tailoring or matching."
      actions={
        <Button size="sm" variant="primary" disabled={!dirty || busy} onClick={save}>
          {busy && <Spinner />} {busy ? "Saving…" : saved && !dirty ? "Saved" : "Save"}
        </Button>
      }
    >
      <div className="space-y-6">
        {data.missing.length > 0 && (
          <Notice tone="info">Still missing: {data.missing.join(", ")}. Junu will ask you for these on each application until you add them.</Notice>
        )}

        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Contact</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {input("firstName", "First name", { autoComplete: "given-name" })}
            {input("lastName", "Last name", { autoComplete: "family-name" })}
            {input("preferredName", "Preferred name", { placeholder: "Optional" })}
            {input("email", "Email", { type: "email", autoComplete: "email" })}
            {input("phone", "Phone", { type: "tel", autoComplete: "tel", placeholder: "+1 555 123 4567" })}
            {input("city", "City", { autoComplete: "address-level2" })}
            {input("state", "State / region", { autoComplete: "address-level1" })}
            {input("country", "Country", { autoComplete: "country-name", placeholder: "United States" })}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Links & current role</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {input("linkedin", "LinkedIn", { type: "url", placeholder: "https://linkedin.com/in/…" })}
            {input("github", "GitHub", { type: "url", placeholder: "https://github.com/…" })}
            {input("portfolio", "Portfolio / website", { type: "url", placeholder: "Optional" })}
            <span className="hidden sm:block" />
            {input("currentCompany", "Current or most recent employer", { placeholder: "Leave blank to read it from your resume" })}
            {input("currentTitle", "Current or most recent title", { placeholder: "Leave blank to read it from your resume" })}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Eligibility & logistics</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {yesNo("workAuthorized", "Authorized to work in the US")}
            {yesNo("needsSponsorship", "Need visa sponsorship")}
            {yesNo("willingToRelocate", "Willing to relocate")}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {input("availability", "Availability", { placeholder: "e.g. 2 weeks' notice" })}
            {input("salaryExpectation", "Salary expectation", { placeholder: "Optional" }, "Left blank on forms unless you fill it in.")}
            {input("howHeard", "How you heard about jobs", { placeholder: "Company careers page" })}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <Switch
            checked={sid.optIn}
            onChange={(v) => setS(v ? { optIn: true } : { optIn: false, gender: "", race: "", hispanicLatino: "", veteran: "", disability: "" })}
            label="Fill in voluntary self-identification"
            description="US employers ask about gender, race/ethnicity, veteran and disability status. It's always optional. When this is off, Jobify answers “I don't wish to answer” and stores nothing. Your answers are never sent to Claude or used for matching. Turning this off deletes them."
          />
          {sid.optIn && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Gender">
                <select className="input" value={sid.gender} onChange={(e) => setS({ gender: e.target.value })}>
                  <option value="">Decline to answer</option>
                  <option>Female</option><option>Male</option><option>Non-binary</option>
                </select>
              </Field>
              <Field label="Race / ethnicity">
                <select className="input" value={sid.race} onChange={(e) => setS({ race: e.target.value })}>
                  <option value="">Decline to answer</option>
                  {["American Indian or Alaska Native", "Asian", "Black or African American", "Hispanic or Latino", "Native Hawaiian or Other Pacific Islander", "White", "Two or More Races"].map((r) => <option key={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Hispanic or Latino">
                <select className="input" value={sid.hispanicLatino} onChange={(e) => setS({ hispanicLatino: e.target.value as SelfIdentification["hispanicLatino"] })}>
                  <option value="">Decline to answer</option><option value="yes">Yes</option><option value="no">No</option>
                </select>
              </Field>
              <Field label="Veteran status">
                <select className="input" value={sid.veteran} onChange={(e) => setS({ veteran: e.target.value as SelfIdentification["veteran"] })}>
                  <option value="">Decline to answer</option>
                  <option value="protected">I identify as a protected veteran</option>
                  <option value="not_protected">I am not a protected veteran</option>
                </select>
              </Field>
              <Field label="Disability status">
                <select className="input" value={sid.disability} onChange={(e) => setS({ disability: e.target.value as SelfIdentification["disability"] })}>
                  <option value="">Decline to answer</option>
                  <option value="yes">Yes, I have a disability</option>
                  <option value="no">No, I don&apos;t have a disability</option>
                </select>
              </Field>
            </div>
          )}
        </section>

        <ErrorNote error={err} />
      </div>
    </Card>
  );
}
