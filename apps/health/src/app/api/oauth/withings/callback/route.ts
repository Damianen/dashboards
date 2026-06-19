import { type NextRequest, NextResponse } from "next/server";

import { OauthProvider } from "@/generated/prisma/client";
import { exchangeCode } from "@/server/integrations/withings";
import { consumeOauthState } from "@/server/services/oauth-state";
import { saveTokens } from "@/server/services/tokens";

export const runtime = "nodejs";

/**
 * Redirect to /settings with the given query. Relative Location so the browser resolves
 * it against the public host it actually used — never the 0.0.0.0/localhost host this
 * server sees behind Tailscale Serve.
 */
function settingsRedirect(search: string): NextResponse {
  return new NextResponse(null, {
    status: 307,
    headers: { Location: `/settings${search}` },
  });
}

/**
 * OAuth callback: validate `state` against the server-side store (a cookie wouldn't
 * survive iOS Safari's cross-origin redirect), exchange the code for tokens, and persist
 * them encrypted. Any failure (bad/absent/expired state, rejected code) redirects back to
 * /settings with ?error=withings — token material never reaches the client. Failures are
 * logged server-side (no secrets) so they're diagnosable in `docker logs`.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  if (!code || !state || !consumeOauthState("withings", state)) {
    console.error("[oauth/withings] callback rejected: missing or invalid state", {
      hasCode: Boolean(code),
      hasState: Boolean(state),
    });
    return settingsRedirect("?error=withings");
  }

  try {
    const tokens = await exchangeCode(code);
    await saveTokens(OauthProvider.WITHINGS, tokens);
  } catch (err) {
    console.error(
      "[oauth/withings] token exchange failed:",
      err instanceof Error ? err.message : String(err),
    );
    return settingsRedirect("?error=withings");
  }

  return settingsRedirect("?connected=withings");
}
