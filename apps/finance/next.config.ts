import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Each app ships as its own container; trace workspace deps from the
  // monorepo root so they land in .next/standalone (see Dockerfile).
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
};

export default nextConfig;
