import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/Nav";
import { getAccess } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Jobify",
  description: "Truthful, job-specific resume tailoring",
  appleWebApp: { capable: true, title: "Jobify", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const access = await getAccess();
  const path = (await headers()).get("x-pathname") ?? "";

  const onPending = path.startsWith("/pending");
  const onBlocked = path.startsWith("/blocked");
  const onAuth = path.startsWith("/auth") || path.startsWith("/login");

  if (!access && (onPending || onBlocked)) redirect("/login");

  if (access) {
    if (access.status === "banned" && !onBlocked && !onAuth) redirect("/blocked");
    if (access.status === "pending" && !onPending && !onAuth) redirect("/pending");
    if (access.status === "active" || access.status === "paused") {
      if (onPending || onBlocked) redirect("/home");
    }
  }

  const locked = access?.status === "pending" || access?.status === "banned";

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <AppShell
          email={locked ? null : access?.email ?? null}
          role={access?.role ?? null}
          paused={access?.status === "paused"}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
