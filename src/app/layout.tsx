import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/Nav";
import { supabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServer } from "@/lib/supabase/server";
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

async function currentEmail(): Promise<string | null> {
  if (!supabaseConfigured()) return null;
  const { data } = await (await createSupabaseServer()).auth.getClaims();
  if (!data?.claims?.sub) return null;
  return typeof data.claims.email === "string" ? data.claims.email : "";
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const email = await currentEmail();
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <AppShell email={email}>{children}</AppShell>
      </body>
    </html>
  );
}
