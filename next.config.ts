import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the project root: a stray package-lock.json in the home directory otherwise
  // makes Next.js infer the wrong workspace root.
  outputFileTracingRoot: path.join(__dirname),
  // Old addresses: the jobs list and Junu's chat moved.
  async redirects() {
    return [
      { source: "/jobs", destination: "/home", permanent: false },
      { source: "/junu", destination: "/home", permanent: false },
      { source: "/chat/history", destination: "/chat", permanent: false },
    ];
  },
};

export default nextConfig;
