"use client";

import Link from "next/link";
import { useApi } from "@/lib/fetcher";
import { Button, Notice } from "./ui";
import { IconUpload } from "./icons";

type Me = {
  hasMasterResume: boolean;
  status: string;
};

/** Prompts new users to upload a master resume before searching jobs. */
export function OnboardingResume() {
  const { data } = useApi<Me>("/api/me");
  if (!data || data.status !== "active" || data.hasMasterResume) return null;

  return (
    <Notice
      tone="info"
      title="Upload your master resume to get started"
      action={
        <Link href="/studio">
          <Button variant="primary" size="sm">
            <IconUpload /> Add master resume
          </Button>
        </Link>
      }
    >
      Jobify needs one master resume before it can search jobs or tailor applications for you.
    </Notice>
  );
}
