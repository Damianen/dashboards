import { beforeAll, describe, expect, it } from "vitest";

// Auth-rejection test for the MCP endpoint. The bearer is checked before the
// server is built, so this exercises no DB. We load the route via dynamic import
// after seeding env so module-load (prisma client construction) is harmless.
type RouteModule = typeof import("./route");
let route: RouteModule;

beforeAll(async () => {
  process.env.FINANCE_MCP_TOKEN = "the-configured-token";
  process.env.DATABASE_URL ??=
    "postgresql://test:test@localhost:5432/finance_dev";
  route = await import("./route");
});

function post(authorization: string | null): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (authorization !== null) headers.authorization = authorization;
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
}

describe("POST /api/mcp authentication", () => {
  it("rejects a request with no Authorization header (401)", async () => {
    const res = await route.POST(post(null));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ jsonrpc: "2.0", error: { code: -32001 } });
  });

  it("rejects a wrong bearer token (401)", async () => {
    const res = await route.POST(post("Bearer not-the-token"));
    expect(res.status).toBe(401);
  });

  it("rejects a raw token without the Bearer scheme (401)", async () => {
    const res = await route.POST(post("the-configured-token"));
    expect(res.status).toBe(401);
  });

  it("returns 405 for GET (POST only, no SSE/sessions)", () => {
    const res = route.GET();
    expect(res.status).toBe(405);
  });
});
