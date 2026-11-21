"use client";

import { useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { Button, ErrorNote, Field, Spinner } from "@/components/ui";
import { createSupabaseBrowser } from "@/lib/supabase/client";

/** Reached from the password-reset email (the callback already signed the user in). */
export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createSupabaseBrowser().auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    window.location.assign("/home");
  }

  return (
    <AuthFrame>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1 text-sm text-slate-500">You&apos;ll be signed in right after.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="New password">
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <Button variant="primary" className="h-11 w-full sm:h-10" disabled={busy}>
          {busy && <Spinner />}
          {busy ? "Saving…" : "Save password"}
        </Button>
        <ErrorNote error={error} />
      </form>
    </AuthFrame>
  );
}
