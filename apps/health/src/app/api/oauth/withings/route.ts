import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { authorizeUrl } from "@/server/integrations/withings";
import { rememberOauthState } from "@/server/services/oauth-state";

export const runtime = "nodejs";

/**
 * Begin the Withings OAuth flow: mint a state token, remember it server-side, and bounce
 * to consent. State is validated server-side (not via a cookie) so the flow survives iOS
 * Safari dropping the Set-Cookie that would ride this cross-origin authorize redirect.
 */
export function GET() {
  const state = randomBytes(16).toString("hex");
  rememberOauthState("withings", state);
  return NextResponse.redirect(authorizeUrl(state));
}
