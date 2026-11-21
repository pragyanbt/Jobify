import { Suspense } from "react";
import { JobsDashboard } from "@/components/JobsDashboard";
import { JunuComposer } from "@/components/Junu";
import { UpdatesInline, UpdatesRail } from "@/components/UpdatesPanel";

// Home: the jobs dashboard with Junu's chat box, and application updates on the right.
export default function HomePage() {
  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1">
        <Suspense>
          <JobsDashboard topSlot={<UpdatesInline />} />
        </Suspense>
        <JunuComposer />
      </div>
      <UpdatesRail />
    </div>
  );
}
