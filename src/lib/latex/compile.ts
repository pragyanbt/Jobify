import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { findBlockedCommands } from "./document";

// Sandboxed LaTeX → PDF.
//
// Layers of isolation, strongest available engine first:
//  1. docker   — `--network none`, read-only rootfs, CPU/mem/pid limits,
//                no shell escape. Used when JOBIFY_LATEX_ENGINE=docker.
//  2. tectonic — `--untrusted` disables shell-escape and other insecure
//                features. Default when installed.
//  3. pdflatex — `-no-shell-escape` + paranoid file access (openin/openout).
// In every mode: fresh temp dir per compile, static scan that refuses
// \write18 / raw file I/O / out-of-dir \input, a hard timeout, a scrubbed
// environment, and capped log size.

export interface CompileResult {
  ok: boolean;
  pdf?: Buffer;
  pageCount?: number;
  log: string;
  engine: string;
  /** First "! ..." error with its line number, if any. */
  error?: { message: string; line?: number };
}

const TIMEOUT_MS = Number(process.env.JOBIFY_LATEX_TIMEOUT_MS ?? 120_000);
const MAX_LOG = 20_000;

type Engine = "docker" | "tectonic" | "pdflatex";

let cachedEngine: Engine | null | undefined;

async function which(bin: string): Promise<boolean> {
  return new Promise((resolve) =>
    execFile("/usr/bin/env", ["which", bin], (err) => resolve(!err)),
  );
}

export async function detectEngine(): Promise<Engine | null> {
  if (cachedEngine !== undefined) return cachedEngine;
  const forced = process.env.JOBIFY_LATEX_ENGINE as Engine | undefined;
  if (forced) return (cachedEngine = forced);
  if (await which("tectonic")) return (cachedEngine = "tectonic");
  if (await which("pdflatex")) return (cachedEngine = "pdflatex");
  return (cachedEngine = null);
}

function run(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  return new Promise<{ code: number; out: string }>((resolve) => {
    execFile(
      cmd,
      args,
      { cwd, env, timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, killSignal: "SIGKILL" },
      (err, stdout, stderr) => {
        const out = `${stdout ?? ""}\n${stderr ?? ""}`;
        const timedOut = err && (err as NodeJS.ErrnoException & { killed?: boolean }).killed;
        resolve({
          code: err ? (typeof err.code === "number" ? err.code : 1) : 0,
          out: timedOut ? out + `\n[jobify] Compilation timed out after ${TIMEOUT_MS / 1000}s.` : out,
        });
      },
    );
  });
}

function baseEnv(): NodeJS.ProcessEnv {
  // Only what the engines need — no API keys or other secrets leak in.
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: os.tmpdir(),
    LANG: "en_US.UTF-8",
  } as unknown as NodeJS.ProcessEnv;
}

export async function compileLatex(latex: string): Promise<CompileResult> {
  const blocked = findBlockedCommands(latex);
  if (blocked.length) {
    return {
      ok: false,
      engine: "none",
      log: `Refused to compile: document uses blocked features (${blocked.join(", ")}).`,
      error: { message: `Blocked LaTeX features: ${blocked.join(", ")}` },
    };
  }

  const engine = await detectEngine();
  if (!engine) {
    return {
      ok: false,
      engine: "none",
      log: "No LaTeX engine found. Install Tectonic (`brew install tectonic`) or set JOBIFY_LATEX_ENGINE=docker.",
      error: { message: "No LaTeX engine installed" },
    };
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jobify-tex-"));
  try {
    await fs.writeFile(path.join(dir, "main.tex"), latex, "utf8");
    let res: { code: number; out: string };

    if (engine === "tectonic") {
      res = await run("tectonic", ["-X", "compile", "--untrusted", "--keep-logs", "-o", dir, "main.tex"], dir, baseEnv());
    } else if (engine === "pdflatex") {
      const env = { ...baseEnv(), openin_any: "p", openout_any: "p", shell_escape: "f" };
      const args = ["-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error", "main.tex"];
      res = await run("pdflatex", args, dir, env);
      if (res.code === 0) res = await run("pdflatex", args, dir, env); // refs/layout pass
    } else {
      const image = process.env.JOBIFY_LATEX_DOCKER_IMAGE ?? "texlive/texlive:latest";
      res = await run(
        "docker",
        [
          "run", "--rm", "--network", "none", "--read-only",
          "--memory", "768m", "--cpus", "1", "--pids-limit", "256",
          "--security-opt", "no-new-privileges", "--cap-drop", "ALL",
          "--tmpfs", "/tmp:rw,size=64m", "-v", `${dir}:/work:rw`, "-w", "/work",
          image, "pdflatex", "-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error", "main.tex",
        ],
        dir,
        baseEnv(),
      );
    }

    let log = res.out;
    try {
      log += "\n" + (await fs.readFile(path.join(dir, "main.log"), "utf8"));
    } catch {
      /* no log file */
    }
    log = log.length > MAX_LOG ? log.slice(-MAX_LOG) : log;

    let pdf: Buffer | undefined;
    try {
      pdf = await fs.readFile(path.join(dir, "main.pdf"));
    } catch {
      /* no pdf */
    }
    const ok = res.code === 0 && !!pdf;
    return {
      ok,
      pdf: ok ? pdf : undefined,
      pageCount: ok && pdf ? pagesFromLog(log) ?? countPdfPages(pdf) : undefined,
      log,
      engine,
      error: ok ? undefined : parseFirstError(log),
    };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export function parseFirstError(log: string): { message: string; line?: number } {
  const lines = log.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const tect = l.match(/^error: main\.tex:(\d+): (.*)$/);
    if (tect) return { message: tect[2], line: Number(tect[1]) };
    if (l.startsWith("! ")) {
      const near = lines.slice(i, i + 8).join("\n");
      const ln = near.match(/l\.(\d+)/);
      return { message: l.slice(2), line: ln ? Number(ln[1]) : undefined };
    }
  }
  const generic = lines.find((l) => /^error:/i.test(l));
  return { message: generic ?? "Compilation failed (see log)." };
}

/** Count pages by scanning for page objects; good enough for resume PDFs. */
export function countPdfPages(pdf: Buffer): number {
  const s = pdf.toString("latin1");
  const m = s.match(/\/Type\s*\/Page(?![a-zA-Z])/g);
  return m ? m.length : 0;
}

/** "Output written on main.xdv (1 page, ...)" — XeTeX/Tectonic and pdfTeX both log this. */
export function pagesFromLog(log: string): number | undefined {
  const m = log.match(/Output written on \S+ \((\d+) pages?/);
  return m ? Number(m[1]) : undefined;
}
