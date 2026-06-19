// Public OAuth callback relay. Exists ONLY so providers that require a publicly
// reachable HTTPS callback (Withings HEAD-validates it and rejects .ts.net /
// localhost) have a stable public URL to register, while the health app stays
// tailnet-only. Bounces the browser (preserving code + state) to a FIXED tailnet
// host. No tokens/secrets/exchange here. Dependency-free on purpose.
const { createServer } = require("node:http");

const PORT = Number(process.env.PORT || 3003);
// Fixed destination from env, NEVER from the request — so this is not an open
// redirector. e.g. https://<node>.tail94f1b7.ts.net
const TARGET_HOST = String(process.env.RELAY_TARGET_HOST || "").replace(/\/+$/, "");
// Exact callback paths allowed to forward (extend for Oura later).
const ALLOWED = new Set(
  String(process.env.RELAY_ALLOWED_PATHS || "/api/oauth/withings/callback")
    .split(",").map((p) => p.trim()).filter(Boolean),
);

if (!TARGET_HOST) {
  console.error("RELAY_TARGET_HOST is required (e.g. https://<node>.tail94f1b7.ts.net)");
  process.exit(1);
}

createServer((req, res) => {
  const { pathname, search, searchParams } = new URL(req.url || "/", "http://localhost");
  if (pathname === "/healthz") { res.writeHead(200); return res.end("ok"); }
  if (!ALLOWED.has(pathname)) { res.writeHead(404); return res.end("not found"); }
  // Withings' reachability probe is HEAD / a GET with no code — answer OK, don't redirect.
  if (req.method === "HEAD" || !searchParams.has("code")) { res.writeHead(200); return res.end("ok"); }
  // Real callback: bounce to the SAME path on the tailnet host, preserving the query.
  res.writeHead(302, { Location: `${TARGET_HOST}${pathname}${search}` });
  res.end();
}).listen(PORT, () => console.log(`oauth-relay listening on :${PORT} -> ${TARGET_HOST}`));
