// Liveness probe for the container healthcheck (compose hits this via node
// fetch). Intentionally trivial — it confirms the Next.js server is serving,
// independent of DB or upstream state, so a slow sync never flips it unhealthy.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
