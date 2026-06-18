import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { authorizeUrl } from "@/server/integrations/withings";

export const runtime = "nodejs";

// CSRF token cookie name, shared with the callback route (kept httpOnly so the SPA can't
// read it). Lax SameSite so it rides the top-level GET redirect back from Withings.
const STATE_COOKIE = "withings_oauth_state";

/** Begin the Withings OAuth flow: mint a state token, stash it, and bounce to consent. */
export function GET() {
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 min to finish consent
  });
  return res;
}
