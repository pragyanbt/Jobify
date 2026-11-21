"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LatexEditor } from "@/components/LatexEditor";
import { PdfPreview } from "@/components/PdfPreview";
import { Badge, Button, buttonClass, ErrorNote, Loading, Notice, PageHeader, Segmented, Spinner, StickyActionBar } from "@/components/ui";
import { IconCheck, IconDownload, IconSparkles, IconStar, IconTrash } from "@/components/icons";
import { api, useApi } from "@/lib/fetcher";

interface Master {
  id: string;
  name: string;
  latex: string;
  isDefault: boolean;
  sourceFormat: string;
  importNotes: string;
  updatedAt: string;
}

export default function MasterPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, reload } = useApi<Master>(`/api/masters/${id}`);
  const [latex, setLatex] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pdfKey, setPdfKey] = useState(0);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pane, setPane] = useState<"preview" | "edit">("preview");

  useEffect(() => {
    if (data) setLatex(data.latex);
  }, [data]);

  // Probe compile so we can show an error instead of a broken iframe.
  useEffect(() => {
    if (!data) return;
    setPdfError(null);
    fetch(`/api/masters/${id}/pdf?v=${pdfKey}`, { method: "GET" }).then(async (r) => {
      if (!r.ok) setPdfError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Compile failed");
    });
  }, [data, id, pdfKey]);

  async function act(label: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(label);
    setErr(null);
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg(ok);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorNote error={error} />;
  if (!data) return <Loading />;
  const dirty = latex !== data.latex;
  const notes = JSON.parse(data.importNotes || "[]") as { severity: "error" | "warning" | "info"; message: string }[];

  const saveBtn = (
    <Button
      variant="primary"
      disabled={!dirty || !!busy}
      onClick={() =>
        act("save", async () => {
          await api(`/api/masters/${id}`, { method: "PUT", json: { latex } });
          await reload();
          setPdfKey((k) => k + 1);
          setPane("preview");
        }, "Saved.")
      }
    >
      {busy === "save" ? <Spinner /> : dirty ? null : <IconCheck />}
      {busy === "save" ? "Saving…" : dirty ? "Save & compile" : "Saved"}
    </Button>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: "/studio", label: "Resume Studio" }}
        title={data.name}
        badges={
          <>
            <Badge>{data.sourceFormat === "latex" ? "LaTeX" : `from ${data.sourceFormat.toUpperCase()}`}</Badge>
            {data.isDefault && <Badge tone="indigo">default</Badge>}
          </>
        }
        description="Master resume. Only your own saves change it; tailoring works on copies."
      />
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button
          onClick={() =>
            act("facts", () => api(`/api/profile/extract-facts`, { method: "POST", json: { masterId: id } }), "Facts extracted. Review and approve them in Settings → Profile facts.")
          }
          disabled={!!busy}
        >
          {busy === "facts" ? <Spinner /> : <IconSparkles />}
          {busy === "facts" ? "Extracting…" : "Extract facts"}
        </Button>
        {!data.isDefault && (
          <Button onClick={() => act("default", () => api(`/api/masters/${id}`, { method: "PUT", json: { isDefault: true } }).then(reload))}>
            <IconStar /> Make default
          </Button>
        )}
        <a className={buttonClass("secondary")} href={`data:application/x-tex;charset=utf-8,${encodeURIComponent(data.latex)}`} download={`${data.name}.tex`}>
          <IconDownload /> Download .tex
        </a>
        <Button
          variant="danger"
          onClick={() => {
            if (confirm("Delete this master resume?"))
              void act("delete", () => api(`/api/masters/${id}`, { method: "DELETE" }).then(() => router.push("/studio")));
          }}
        >
          <IconTrash /> Delete
        </Button>
        <div className="hidden sm:ml-auto sm:block">{saveBtn}</div>
      </div>
      <ErrorNote error={err} />
      {notes.length > 0 && (
        <Notice
          tone="warning"
          title="Review this conversion before tailoring"
          action={
            <Button size="sm" onClick={() => act("notes", () => api(`/api/masters/${id}`, { method: "PUT", json: { importNotes: "[]" } }).then(reload))}>
              I&apos;ve reviewed it
            </Button>
          }
        >
          <ul className="mt-1 space-y-1.5">
            {notes.map((n, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-px"><Badge tone={n.severity === "error" ? "red" : n.severity === "warning" ? "amber" : "slate"}>{n.severity}</Badge></span>
                <span className="text-slate-700">{n.message}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-900/80">Tailoring treats this resume as the truth about your background, so fix anything inaccurate in the editor first.</p>
        </Notice>
      )}
      {msg && <Notice tone="success">{msg}</Notice>}

      <Segmented
        className="w-full lg:hidden"
        value={pane}
        onChange={setPane}
        options={[["preview", "Preview"], ["edit", dirty ? "Edit •" : "Edit"]] as const}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={pane === "edit" ? "" : "hidden lg:block"}>
          <LatexEditor value={latex} onChange={setLatex} />
        </div>
        <div className={pane === "preview" ? "" : "hidden lg:block"}>
          {pdfError ? (
            <ErrorNote error={`PDF preview unavailable: ${pdfError}`} />
          ) : (
            <PdfPreview src={`/api/masters/${id}/pdf?v=${pdfKey}`} title="Master PDF" />
          )}
        </div>
      </div>

      {dirty && (
        <StickyActionBar className="sm:hidden">
          <div className="[&>button]:w-full">{saveBtn}</div>
        </StickyActionBar>
      )}
    </div>
  );
}
