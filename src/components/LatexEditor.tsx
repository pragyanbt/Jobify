"use client";

import dynamic from "next/dynamic";
import type { Monaco } from "@monaco-editor/react";

const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="p-4 text-sm text-slate-500">Loading editor…</div>,
});

let registered = false;
function registerLatex(monaco: Monaco) {
  if (registered) return;
  registered = true;
  monaco.languages.register({ id: "latex" });
  monaco.languages.setMonarchTokensProvider("latex", {
    tokenizer: {
      root: [
        [/(^|[^\\])%.*$/, "comment"],
        [/\\(begin|end)\{[^}]*\}/, "keyword"],
        [/\\(section|subsection)\*?/, "type"],
        [/\\[a-zA-Z@]+\*?/, "tag"],
        [/\\./, "string.escape"],
        [/[{}]/, "delimiter.bracket"],
        [/\$[^$]*\$/, "number"],
      ],
    },
  });
}

export function LatexEditor({ value, onChange, readOnly, height = "clamp(420px, 70vh, 1200px)" }: {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  height?: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <Editor
        height={height}
        language="latex"
        value={value}
        beforeMount={registerLatex}
        onChange={(v) => onChange?.(v ?? "")}
        options={{
          readOnly,
          minimap: { enabled: false },
          wordWrap: "on",
          fontSize: 12.5,
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          renderWhitespace: "none",
        }}
      />
    </div>
  );
}
