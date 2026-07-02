import { jsonError } from "@/lib/api";
import { verifyBearer } from "@/mcp/auth";
import { parseWorkouts, upsertWorkouts } from "@/server/services/healthImport";

export const runtime = "nodejs";

// Memory backstop only. App Router has no Pages-router bodyParser cap to "relax"; this
// guards against an accidental routes-included export OOMing the container. HAE is
// configured to send workout metadata WITHOUT GPS route data, so real payloads are tiny.
const MAX_BODY_BYTES = 25 * 1024 * 1024;

/**
 * Ingest endpoint for Apple Watch workouts pushed by the Health Auto Export (HAE) iOS
 * app over Tailscale (tailnet-private; never public). Push-based — HAE POSTs HealthKit
 * JSON, no scheduler. Guarded by a timing-safe bearer check against HEALTH_IMPORT_TOKEN
 * (the only in-app auth surface here). Idempotent: workouts upsert by externalId, so
 * HAE's overlapping re-sends never duplicate. A zero-workout payload is a 200 no-op.
 */
export async function POST(req: Request): Promise<Response> {
  if (!verifyBearer(req.headers.get("authorization"), process.env.HEALTH_IMPORT_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // Cap on the bytes actually received — a Content-Length header is client-supplied
    // and a chunked sender has none, so the header alone can't bound memory.
    const raw = await req.arrayBuffer();
    if (raw.byteLength > MAX_BODY_BYTES) {
      return Response.json({ error: "payload too large" }, { status: 413 });
    }
    const payload: unknown = JSON.parse(new TextDecoder().decode(raw));
    const workouts = parseWorkouts(payload);
    if (process.env.HEALTH_IMPORT_DEBUG === "true") {
      // Shape-debugging aid: sizes and top-level keys only — the payload is health
      // data and must never be logged raw.
      const keys =
        typeof payload === "object" && payload !== null
          ? Object.keys(payload).join(", ")
          : typeof payload;
      console.log(
        `[health-import] ${raw.byteLength} bytes, top-level keys: ${keys}, ` +
          `${workouts.length} workout(s) parsed`,
      );
    }
    const result = await upsertWorkouts(workouts);
    return Response.json(result);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return Response.json({ error: "invalid JSON" }, { status: 400 });
    }
    return jsonError(err);
  }
}
