import { Suspense } from "react";
import { AdminDeniedBanner } from "@/components/AdminDeniedBanner";
import { JobsDashboard } from "@/components/JobsDashboard";
import { JunuComposer } from "@/components/Junu";
import { UpdatesInline, UpdatesRail } from "@/components/UpdatesPanel";

// Home: the jobs dashboard with Junu's chat box, and application updates on the right.
export default function HomePage() {
  return (
    <div className="flex gap-6 lg:gap-8">
      <div className="min-w-0 flex-1 space-y-5">
        <Suspense>
          <AdminDeniedBanner />
        </Suspense>
        <Suspense>
          <JobsDashboard topSlot={<UpdatesInline />} />
        </Suspense>
        <JunuComposer />
      </div>
      <UpdatesRail />
    </div>
  );
}
