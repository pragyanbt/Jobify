"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { Button, ErrorNote, Field, Notice, Spinner } from "@/components/ui";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type Mode = "signin" | "signup" | "reset";

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error"));
  const [info, setInfo] = useState<string | null>(null);
  const google = process.env.NEXT_PUBLIC_AUTH_GOOGLE === "true";

  const callback = (to: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(to)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = createSupabaseBrowser();
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.assign(next);
        return;
      }
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: callback(next) },
        });
        if (error) throw error;
        if (data.session) {
          window.location.assign(next);
          return;
        }
        setInfo("Check your email for a confirmation link, then come back and sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callback("/auth/reset-password") });
        if (error) throw error;
        setInfo("If that email has an account, a password reset link is on its way.");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function withGoogle() {
    setError(null);
    const { error } = await createSupabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback(next) },
    });
    if (error) setError(error.message);
  }

  const title = { signin: "Welcome back", signup: "Create your account", reset: "Reset your password" }[mode];
  const subtitle = {
    signin: "Sign in to pick up where you left off.",
    signup: "Your resumes, jobs and applications are saved to your account.",
    reset: "We'll email you a link to choose a new password.",
  }[mode];

  return (
    <AuthFrame>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>

      {google && mode !== "reset" && (
        <>
          <Button className="mt-6 w-full" onClick={withGoogle} type="button">Continue with Google</Button>
          <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
          </div>
        </>
      )}

      <form onSubmit={submit} className={google && mode !== "reset" ? "space-y-4" : "mt-6 space-y-4"}>
        <Field label="Email">
          <input className="input" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        {mode !== "reset" && (
          <Field
            label={
              <span className="flex items-center justify-between">
                Password
                {mode === "signin" && (
                  <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => { setMode("reset"); setError(null); }}>
                    Forgot password?
                  </button>
                )}
              </span>
            }
          >
            <input
              className="input"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
              minLength={mode === "signup" ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
        )}
        <Button variant="primary" className="h-11 w-full text-[15px] sm:h-10" disabled={busy}>
          {busy && <Spinner />}
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
        </Button>
      </form>

      {(error || info) && (
        <div className="mt-4 space-y-2">
          <ErrorNote error={error} />
          {info && <Notice tone="success">{info}</Notice>}
        </div>
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        {mode === "signin" ? (
          <>New to Jobify?{" "}<button className="link" onClick={() => { setMode("signup"); setError(null); }}>Create an account</button></>
        ) : (
          <>{mode === "signup" ? "Already have an account? " : ""}<button className="link" onClick={() => { setMode("signin"); setError(null); }}>{mode === "signup" ? "Sign in" : "Back to sign in"}</button></>
        )}
      </p>
    </AuthFrame>
  );
}

/** Only allow same-site relative redirects after sign-in. */
function safeNext(n: string | null): string {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/home";
}
