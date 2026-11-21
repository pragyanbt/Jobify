import { Logo } from "@/components/icons";

export default function SetupPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <Logo size={36} />
        <span className="text-lg font-semibold tracking-tight">Jobify</span>
      </div>
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm sm:p-6">
        <h1 className="text-xl font-semibold tracking-tight">Connect Jobify to Supabase</h1>
        <p className="text-slate-600">Jobify needs your Supabase project settings before you can sign in.</p>
        <ol className="list-decimal space-y-3 pl-5 text-slate-700">
          <li>
            In the Supabase dashboard open <b>Project Settings → API</b> and copy the <b>Project URL</b> and the{" "}
            <b>publishable</b> (or <b>anon</b>) key.
          </li>
          <li>
            Open <b>Connect</b> (top bar) → <b>Connection string → Session pooler</b>, and copy the connection string
            with your database password filled in. Percent-encode special characters in the password (<code>@</code> → <code>%40</code>, <code>#</code> → <code>%23</code>).
          </li>
          <li>
            Add them to <code>.env.local</code>:
            <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{`NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@<region>.pooler.supabase.com:5432/postgres
DIRECT_URL=postgresql://postgres.<project-ref>:<password>@<region>.pooler.supabase.com:5432/postgres`}</pre>
          </li>
          <li>
            Run <code>npm run db:setup</code>, then restart Jobify.
          </li>
        </ol>
      </div>
    </div>
  );
}
