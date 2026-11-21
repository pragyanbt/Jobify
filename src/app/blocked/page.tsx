import { AuthFrame } from "@/components/AuthFrame";
import { Notice } from "@/components/ui";

/** Shown when the account is banned. */
export default function BlockedPage() {
  return (
    <AuthFrame>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Account disabled</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">
        This account can&apos;t use Jobify right now.
      </p>
      <div className="mt-6">
        <Notice tone="warning" title="Need help?">
          If you think this is a mistake, contact the person who invited you to Jobify.
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
