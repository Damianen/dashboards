import { withingsOauth } from "@/server/oauth-routes";

export const runtime = "nodejs";

export const GET = withingsOauth.callback;
