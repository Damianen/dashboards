import { jsonError } from "@/lib/api";
import { todayLocal } from "@/lib/dates";
import { exportQuerySchema } from "@/lib/schemas/export";
import { buildExport } from "@/server/services/export";

export const runtime = "nodejs";

/**
 * Full-fidelity JSON export of the user's health data, served as a download.
 * `?domains=` narrows to a comma-separated subset (default: everything),
 * `?from=`/`?to=` bound the time-series domains, `?include_raw=false` drops
 * vendor raw payloads. Cloudflare Access protects this route upstream — it is
 * never reachable anonymously (CLAUDE.md auth rule).
 */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const parsed = exportQuerySchema.safeParse({
      domains: sp.get("domains") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      include_raw: sp.get("include_raw") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    const bundle = await buildExport({
      domains: parsed.data.domains,
      from: parsed.data.from,
      to: parsed.data.to,
      includeRaw: parsed.data.include_raw,
    });
    return Response.json(bundle, {
      headers: {
        "Content-Disposition": `attachment; filename="health-export-${todayLocal()}.json"`,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
