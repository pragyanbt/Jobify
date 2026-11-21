import type { MetadataRoute } from "next";

/** Installable app: "Add to Home Screen" opens Home first. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jobify",
    short_name: "Jobify",
    description: "Truthful, job-specific resume tailoring with Junu, your job search assistant.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#ffffff",
    icons: [
      { src: "/logo.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
