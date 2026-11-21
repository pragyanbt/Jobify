import Link from "next/link";
import { UpdatesPanel } from "@/components/UpdatesPanel";
import { IconChevronLeft } from "@/components/icons";

/** Full-page extended view of the Updates card. */
export default function UpdatesPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-3xl flex-col gap-4">
      <Link href="/home" className="-ml-1.5 inline-flex w-fit items-center gap-0.5 rounded-full px-1.5 py-1.5 text-sm text-slate-500 hover:bg-white hover:text-slate-900">
        <IconChevronLeft width={16} height={16} /> Home
      </Link>
      <div className="min-h-0 flex-1">
        <UpdatesPanel full />
      </div>
    </div>
  );
}
