import { AuthFrame } from "@/components/AuthFrame";
import { Notice } from "@/components/ui";

/** Shown after sign-up until an admin approves the account. */
export default function PendingPage() {
  return (
    <AuthFrame>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Waiting for approval</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">
        Your account was created. An admin needs to approve it before you can use Jobify.
      </p>
      <div className="mt-6">
        <Notice tone="info" title="What happens next?">
          We&apos;ll unlock your account once it&apos;s reviewed. You can close this page and sign in again later.
        </Notice>
      </div>
      <form action="/auth/signout" method="post" className="mt-8">
        <button type="submit" className="link text-sm">
          Sign out
        </button>
      </form>
    </AuthFrame>
  );
}
