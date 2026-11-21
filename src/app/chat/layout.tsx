import type { ReactNode } from "react";
import { UpdatesRail } from "@/components/UpdatesPanel";

/** Chat pages: the chat card in the middle, application updates on the right. */
export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 gap-6">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      <UpdatesRail />
    </div>
  );
}
