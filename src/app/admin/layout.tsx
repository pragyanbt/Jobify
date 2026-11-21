import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";

/** Only admins can open /admin. Everyone else goes home. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await getAccess();
  if (!access) redirect("/login?next=/admin");
  if (access.role !== "admin") redirect("/home?error=admin");
  return children;
}
