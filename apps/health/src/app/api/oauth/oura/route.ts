import { ouraOauth } from "@/server/oauth-routes";

export const runtime = "nodejs";

export const GET = ouraOauth.initiate;
