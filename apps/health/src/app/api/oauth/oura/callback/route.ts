import { timingSafeEqual } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import { OauthProvider } from "@/generated/prisma/client";
import { exchangeCode } from "@/server/integrations/oura";
import { saveTokens } from "@/server/services/tokens";

export const runtime = "nodejs";

const STATE_COOKIE = "oura_oauth_state";

/** Redirect to /settings with the given query, clearing the one-shot state cookie. */
function settingsRedirect(req: NextRequest, search: string): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = "/settings";
  url.search = search;
  const res = NextResponse.redirect(url);
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
 * encrypted. Any failure (bad/absent state, rejected code) redirects back to /settings with
 * ?error=oura — token material never reaches the client.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieState = req.cookies.get(STATE_COOKIE)?.value;

  if (!code || !state || !cookieState || !statesMatch(state, cookieState)) {
    return settingsRedirect(req, "?error=oura");
  }

  try {
    const tokens = await exchangeCode(code);
    await saveTokens(OauthProvider.OURA, tokens);
  } catch {
    return settingsRedirect(req, "?error=oura");
  }

  return settingsRedirect(req, "?connected=oura");
}
