# Jobify — AI resume tailoring

Truthful, job-specific resume tailoring with LaTeX template preservation.

## Setup

```bash
npm install
brew install tectonic          # sandboxed LaTeX → PDF (or set JOBIFY_LATEX_ENGINE=docker / pdflatex)
cp .env.example .env.local     # Claude key + Supabase URL/key + database URL
npm run db:setup               # creates tables in Supabase and locks them down (RLS)
npm run dev                    # http://localhost:3000
```

In the Supabase dashboard → **Authentication → URL Configuration**, set **Site URL** to
`http://localhost:3000` and add `http://localhost:3000/auth/callback` to **Redirect URLs**.

Then sign up, and: **Resume Studio → Add master resume**, **Settings → Profile facts**,
**Jobs → Search now** or **Add job**.

### Accounts and data

- Sign-in is Supabase Auth (email + password; Google optional via `NEXT_PUBLIC_AUTH_GOOGLE=true`).
- New accounts stay **pending** until an admin approves them. Admins are listed in
  `JOBIFY_ADMIN_EMAILS` (default `pragyan4044@gmail.com`) and get a **Dev dashboard** at `/admin`
  to approve, pause (blocks Claude spend), or ban users and to review API cost.
- Data lives in Supabase Postgres via Prisma. Every row is owned by a user and every query is scoped
  to the signed-in user (`src/lib/auth.ts`, `authed()` in `src/lib/api.ts`).
- `prisma/rls.sql` enables row-level security with no policies and revokes API-role access, so
  Supabase's public REST API can't read Jobify's tables. Re-run `npm run db:secure` after schema changes.
- Data created before sign-in (`data/jobify.db`) can be imported once from the banner on the Jobs page.

## How it works

| Step | Where |
|---|---|
| Job analysis (required/preferred skills, ATS keywords, qualifications) | `src/lib/ai/operations.ts` → `analyzeJob` |
| Resume import: PDF (read by Claude directly), DOCX (mammoth), text → default LaTeX template, with figure cross-check | `src/lib/resumeImport.ts` |
| Best master selection + deterministic match scoring | `src/lib/scoring.ts`, `src/lib/pipeline.ts` |
| Tailoring as find/replace edits on the document **body only** | `proposeTailoring`, `src/lib/latex/edits.ts` |
| Truthfulness: per-edit revert of unsupported skills/figures, LLM fact-check, whole-doc validation | `src/lib/pipeline.ts` (`applyAndVerify`), `src/lib/validation.ts` |
| Sandboxed compile + automatic syntax repair | `src/lib/latex/compile.ts`, `compileWithRepair` |
| Versioning, approval, application linking | `ResumeVersion` / `Application` in `prisma/schema.prisma` |
| Job search: company career sites (Greenhouse/Lever/Ashby), Remotive, optional Adzuna; title/location/recency filters; scheduled every N hours | `src/lib/jobsearch/*`, `src/instrumentation.ts` |
| Auto-apply + discovery hook | `src/lib/discovery.ts`, `POST /api/discovery` |
| Outcome insights (descriptive only) | `src/lib/insights.ts` |

**Truthfulness rule.** Evidence = your master resume text (comments excluded) + *approved* profile facts.
Any edit that introduces a job skill or a number not found in the evidence is reverted; edits flagged by
the fact-check pass are reverted; the final document is re-validated. User edits are validated the same way;
approving with errors requires an explicit accuracy confirmation.

**Sandbox.** Tectonic runs with `--untrusted`; pdflatex with `-no-shell-escape` and paranoid file access;
Docker with `--network none`, read-only rootfs, and resource limits. All modes use a temp dir, a timeout,
a scrubbed environment, and a static scan that refuses `\write18`, raw file I/O and out-of-directory `\input`.

**Submitting.** Only the `manual` channel exists: approved resumes are prepared for you to submit.
Add authorized integrations (e.g. an official ATS partner API) with `registerChannel()` in `src/lib/channels.ts`.

## Tests

```bash
npm test   # unit tests + pipeline integration test (Claude mocked, real SQLite + LaTeX)
```
