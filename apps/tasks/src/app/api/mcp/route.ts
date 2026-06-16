// The tasks MCP server: stateless Streamable HTTP at /api/mcp, the only path
// that serves MCP. mcp-handler bridges the Next.js Web Request to the SDK's
// transport; basePath "/api" makes it answer at exactly /api/mcp, and SSE is
// disabled so there is no second endpoint. Every request is gated by a
// timing-safe bearer check before it reaches the handler.

import { createMcpHandler } from "mcp-handler";

import { checkBearer } from "@/server/mcp/auth";
import { registerTools } from "@/server/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = createMcpHandler(
  registerTools,
  { serverInfo: { name: "tasks", version: "0.1.0" } },
  { basePath: "/api", disableSse: true, verboseLogs: false },
);

function unauthorized(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32001, message: "Unauthorized" },
    }),
    {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": 'Bearer realm="tasks-mcp"',
      },
    },
  );
}

async function guarded(req: Request): Promise<Response> {
  if (!checkBearer(req)) return unauthorized();
  return handler(req);
}

export { guarded as GET, guarded as POST };
