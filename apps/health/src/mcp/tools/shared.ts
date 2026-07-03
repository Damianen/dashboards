// Helpers shared by every domain tool module: JSON tool results and the one
// service-error → tool-error translation chokepoint.

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { DomainError } from "@/server/services/errors";
import { VisionError } from "@/server/services/vision";

// The active_kcal honesty caveat (CLAUDE.md domain guardrail), shared verbatim by the
// two tools that surface device energy expenditure.
export const ACTIVE_KCAL_CAVEAT =
  "active_kcal is a wearable trend estimate (error can exceed 27–90%) — treat as " +
  "relative signal, never absolute truth; intake and expenditure are separate " +
  "metrics, do not net them.";

export function ok(result: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
}

export function fail(error: string, extra?: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error, ...extra }) }],
    isError: true,
  };
}

/** Run a tool body, translating service errors into tool errors. Zod parse failures
 *  (services validate their own input) → invalid input; domain errors → their message. */
export async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return fail("invalid input", { issues: err.flatten() });
    }
    if (err instanceof DomainError) return fail(err.message);
    // VisionError is an upstream provider/parse failure; its message is already
    // generic (never leaks the image or API key), so surface it to the agent.
    if (err instanceof VisionError) return fail(err.message);
    console.error(err);
    return fail("internal error");
  }
}
