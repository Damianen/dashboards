import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { verifyBearer } from "@/mcp/auth";
import { buildServer } from "@/mcp/server";

export const runtime = "nodejs";

function jsonRpcError(
  code: number,
  message: string,
  status: number,
  headers?: Record<string, string>,
): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code, message }, id: null },
    { status, headers },
  );
}

export async function POST(req: Request): Promise<Response> {
  if (
    !verifyBearer(
      req.headers.get("authorization"),
      process.env.FINANCE_MCP_TOKEN,
    )
  ) {
    return jsonRpcError(-32001, "Unauthorized", 401);
  }

  // Stateless: a fresh server + transport per request, torn down after we respond.
  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    await transport.close();
    await server.close();
  }
}

// No SSE streams, no sessions — only POST is supported.
function methodNotAllowed(): Response {
  return jsonRpcError(-32000, "Method not allowed", 405, { Allow: "POST" });
}

export function GET(): Response {
  return methodNotAllowed();
}

export function DELETE(): Response {
  return methodNotAllowed();
}
