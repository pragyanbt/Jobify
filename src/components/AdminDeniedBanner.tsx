"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Notice } from "./ui";

/** Shown on Home when a non-admin hits /admin. */
export function AdminDeniedBanner() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (params.get("error") === "admin") {
      setShow(true);
      router.replace(path);
    }
  }, [params, path, router]);

  if (!show) return null;
  return (
    <Notice tone="warning" title="Admins only">
      The Dev dashboard is only available on admin accounts.
    </Notice>
  );
}
