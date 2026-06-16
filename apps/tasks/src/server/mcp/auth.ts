// The single in-app auth surface: a shared-secret bearer check for /api/mcp.
// (The web UI is fronted by Cloudflare Access; only this route authenticates
// in-process.) Compares against MCP_BEARER_TOKEN in constant time by hashing
// both sides to a fixed length first — that sidesteps timingSafeEqual's
// throw on unequal-length buffers without leaking the token length.

import { createHash, timingSafeEqual } from "node:crypto";

const BEARER_RE = /^Bearer\s+(.+)$/i;

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** True when the request carries the configured bearer token. */
export function checkBearer(req: Request): boolean {
  const expected = process.env.MCP_BEARER_TOKEN;
  if (!expected) return false; // misconfigured server: deny rather than allow

  const match = BEARER_RE.exec(req.headers.get("authorization") ?? "");
  if (!match) return false;

  return timingSafeEqual(digest(match[1].trim()), digest(expected));
}
