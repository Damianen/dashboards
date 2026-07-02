import path from "node:path";
import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Each app ships as its own container; trace workspace deps from the
  // monorepo root so they land in .next/standalone (see Dockerfile).
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // @serwist/next always attaches a `webpack` config (even when disabled), which
  // Next 16's default Turbopack dev server rejects unless a turbopack config also
  // exists. An empty object opts dev into Turbopack; the production build runs
  // `next build --webpack` so serwist can bundle the service worker.
  turbopack: {},
};

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  // The service worker only matters in production; turning it off in dev avoids
  // stale-cache surprises during local development.
  disable: process.env.NODE_ENV === "development",
  // The offline fallback document (sw.ts `fallbacks`) must be precached. A fresh
  // revision per build re-precaches it on deploy.
  additionalPrecacheEntries: [
    { url: "/~offline", revision: crypto.randomUUID() },
  ],
});

export default withSerwist(nextConfig);
