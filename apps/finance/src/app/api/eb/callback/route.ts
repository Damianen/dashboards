import { NextResponse, type NextRequest } from "next/server";

import {
  completeConnection,
  markConnectionError,
} from "@/server/services/connections";

// Enable Banking redirects the user here after they authorize at their bank,
// with ?code & ?state (or ?error on denial). Thin adapter: hand off to the
// connections service, then bounce back to /settings with a status.

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const state = searchParams.get("state") ?? "";
  const code = searchParams.get("code") ?? "";
  const error = searchParams.get("error");

  const back = (query: string) =>
    NextResponse.redirect(new URL(`/settings?${query}`, req.url));

  if (error) {
    if (state) await markConnectionError(state, error).catch(() => {});
    return back("error=denied");
  }
  if (!state || !code) return back("error=missing_params");

  try {
    const connection = await completeConnection({ state, code });
    return back(`connected=${connection.bank}`);
  } catch {
    await markConnectionError(state, "callback_failed").catch(() => {});
    return back("error=callback_failed");
  }
}
