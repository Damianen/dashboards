// Bulk-export tool: one domain per call, raw vendor payloads always off.
// Cross-field rules (range required for time series, span cap) live in the
// handler because MCP input schemas are flat field maps.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { daysBetween, todayLocal } from "@/lib/dates";
import { daySchema } from "@/lib/schemas/common";
import {
  exportDomainSchema,
  TIME_SERIES_DOMAINS,
} from "@/lib/schemas/export";
import { buildExport } from "@/server/services/export";

import { fail, run } from "./shared";

/** Inclusive day-span cap per pull — one leap year. */
const MAX_SPAN_DAYS = 366;

const TIME_SERIES_LIST = [...TIME_SERIES_DOMAINS].join(", ");

export function registerExportTools(server: McpServer): void {
  server.registerTool(
    "export_data",
    {
      description:
        "Bulk data pull of ONE domain's stored rows, fully serialized (numbers, " +
        "civil YYYY-MM-DD days, ISO timestamps) — for analysis, migration or " +
        "offline processing, not day-to-day questions (use the get_* tools for " +
        "those). Responses can be LARGE — prefer narrow from/to ranges. " +
        `Time-series domains (${TIME_SERIES_LIST}) require \`from\`; ` +
        "the remaining domains are catalogs exported whole (range ignored). " +
        "Grouped domains return several collections: sleep {sessions, " +
        "dailyScores}, supplements {catalog, logs, legacyEntries}, lifting " +
        "{exercises, sessions}; the rest return {rows}. `count` counts the " +
        "primary collection. Raw vendor payloads are NEVER included here; for " +
        "a full multi-domain dump with raw payloads use the Cloudflare-Access-" +
        "protected web route GET /api/export. Read-only.",
      inputSchema: {
        domain: exportDomainSchema.describe("Which single domain to export."),
        from: daySchema
          .optional()
          .describe(
            "Range start, civil YYYY-MM-DD (Europe/Amsterdam). REQUIRED for " +
              "time-series domains; ignored for catalogs.",
          ),
        to: daySchema
          .optional()
          .describe("Range end, civil YYYY-MM-DD. Defaults to today."),
      },
    },
    async ({ domain, from, to }) => {
      if (TIME_SERIES_DOMAINS.has(domain) && from == null) {
        return fail(
          `"${domain}" is a time-series domain — provide \`from\` (and optionally ` +
            "`to`) to bound the pull; responses can be large.",
        );
      }
      const rangeTo = from != null ? (to ?? todayLocal()) : to;
      if (from != null && rangeTo != null) {
        if (from > rangeTo) {
          return fail(`\`from\` (${from}) is after \`to\` (${rangeTo}).`);
        }
        const spanDays = daysBetween(from, rangeTo) + 1;
        if (spanDays > MAX_SPAN_DAYS) {
          return fail(
            `range spans ${spanDays} days — max ${MAX_SPAN_DAYS}; split into ` +
              "smaller pulls.",
          );
        }
      }
      return run(async () => {
        // Raw vendor payloads are forced off over MCP by design.
        const bundle = await buildExport({
          domains: [domain],
          from,
          to: rangeTo,
          includeRaw: false,
        });
        const base = {
          domain,
          range: bundle.range,
          count: bundle.counts[domain] ?? 0,
        };
        const payload = bundle.domains[domain];
        return Array.isArray(payload)
          ? { ...base, rows: payload }
          : { ...base, ...payload };
      });
    },
  );
}
