import { timingSafeEqual } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import { OauthProvider } from "@/generated/prisma/client";
import { exchangeCode } from "@/server/integrations/withings";
import { saveTokens } from "@/server/services/tokens";

export const runtime = "nodejs";

const STATE_COOKIE = "withings_oauth_state";

/**
 * Redirect to /settings with the given query, clearing the one-shot state cookie.
 * Uses a relative Location so the browser resolves it against the public host it
 * actually used — never the 0.0.0.0/localhost host this server sees behind Tailscale
 * Serve (where `NextResponse.redirect` would emit an unreachable http://0.0.0.0:3000/…).
 */
function settingsRedirect(search: string): NextResponse {
  const res = new NextResponse(null, {
    status: 307,
    headers: { Location: `/settings${search}` },
  });
  res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true });
  return res;
}

/** Constant-time equality for the CSRF state token. */
function statesMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * OAuth callback: verify the state cookie, exchange the code for tokens, and persist them
 * encrypted. Any failure (bad/absent state, rejected code) redirects back to /settings
 * with ?error=withings — token material never reaches the client.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieState = req.cookies.get(STATE_COOKIE)?.value;

  if (!code || !state || !cookieState || !statesMatch(state, cookieState)) {
    return settingsRedirect("?error=withings");
  }

  try {
    const tokens = await exchangeCode(code);
    await saveTokens(OauthProvider.WITHINGS, tokens);
  } catch {
    return settingsRedirect("?error=withings");
  }

  return settingsRedirect("?connected=withings");
}
