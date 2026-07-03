// Factory for the provider OAuth route pairs. The four files under
// src/app/api/oauth/ are one-line re-exports of the handlers built here — the flow
// is identical for every provider modulo slug, enum value, and the two integration
// functions.

import { randomBytes } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import { OauthProvider } from "@/generated/prisma/client";
import * as oura from "@/server/integrations/oura";
import * as withings from "@/server/integrations/withings";
import {
  consumeOauthState,
  rememberOauthState,
} from "@/server/services/oauth-state";
import { type OauthTokens, saveTokens } from "@/server/services/tokens";

export interface OauthRouteConfig {
  /** URL/log slug; also the oauth-state namespace and the ?connected=/?error= value. */
  slug: "oura" | "withings";
  provider: OauthProvider;
  /** The consent URL to send the user to. `state` is the CSRF token we verify on callback. */
  authorizeUrl: (state: string) => string;
  exchangeCode: (code: string) => Promise<OauthTokens>;
}

export interface OauthRoutes {
  initiate: () => NextResponse;
  callback: (req: NextRequest) => Promise<NextResponse>;
}

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

export function createOauthRoutes(cfg: OauthRouteConfig): OauthRoutes {
  const { slug, provider, authorizeUrl, exchangeCode } = cfg;

  /**
   * Begin the OAuth flow: mint a state token, remember it server-side, and bounce to
   * consent. State is validated server-side (not via a cookie) so the flow survives iOS
   * Safari dropping the Set-Cookie that would ride this cross-origin authorize redirect.
   */
  function initiate(): NextResponse {
    const state = randomBytes(16).toString("hex");
    rememberOauthState(slug, state);
    return NextResponse.redirect(authorizeUrl(state));
  }

  /**
   * OAuth callback: validate `state` against the server-side store (a cookie wouldn't
   * survive iOS Safari's cross-origin redirect), exchange the code for tokens, and persist
   * them encrypted. Any failure (bad/absent/expired state, rejected code) redirects back to
   * /settings with ?error=<slug> — token material never reaches the client. Failures are
   * logged server-side (no secrets) so they're diagnosable in `docker logs`.
   */
  async function callback(req: NextRequest): Promise<NextResponse> {
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");

    if (!code || !state || !consumeOauthState(slug, state)) {
      console.error(
        `[oauth/${slug}] callback rejected: missing or invalid state`,
        {
          hasCode: Boolean(code),
          hasState: Boolean(state),
        },
      );
      return settingsRedirect(`?error=${slug}`);
    }

    try {
      const tokens = await exchangeCode(code);
      await saveTokens(provider, tokens);
    } catch (err) {
      console.error(
        `[oauth/${slug}] token exchange failed:`,
        err instanceof Error ? err.message : String(err),
      );
      return settingsRedirect(`?error=${slug}`);
    }

    return settingsRedirect(`?connected=${slug}`);
  }

  return { initiate, callback };
}

export const ouraOauth = createOauthRoutes({
  slug: "oura",
  provider: OauthProvider.OURA,
  authorizeUrl: oura.authorizeUrl,
  exchangeCode: oura.exchangeCode,
});

export const withingsOauth = createOauthRoutes({
  slug: "withings",
  provider: OauthProvider.WITHINGS,
  authorizeUrl: withings.authorizeUrl,
  exchangeCode: withings.exchangeCode,
});
