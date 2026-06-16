// End-to-end smoke test for the MCP server. Runs over real Streamable HTTP
// against a running `pnpm dev` (set MCP_URL to point elsewhere), using the MCP
// TypeScript client with the bearer header. Verifies the no-token 401, lists
// tools, then create → list → complete → verify. Cleans up via Prisma, so it
// refuses to run against anything but a *_dev database.

import "dotenv/config";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type {
  SerializedProject,
  SerializedTask,
} from "@/server/mcp/serialize";
import { prisma } from "@/server/db";

// --- config ----------------------------------------------------------------

const MCP_URL = process.env.MCP_URL ?? "http://localhost:3000/api/mcp";
const TOKEN = process.env.MCP_BEARER_TOKEN ?? "";

if (TOKEN === "") {
  console.error("Refusing to run: MCP_BEARER_TOKEN is not set.");
  process.exit(1);
}

// --- safety: cleanup hits the DB directly, so guard the dev database --------

const dbName = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
  } catch {
    return "";
  }
})();
if (!dbName.endsWith("_dev")) {
  console.error(
    `Refusing to run: database "${dbName || "<unparseable>"}" does not end in _dev.`,
  );
  process.exit(1);
}

// --- mini harness -----------------------------------------------------------

let passed = 0;
const failures: { name: string; error: unknown }[] = [];

async function check(
  name: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push({ name, error });
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`  FAIL ${name}: ${msg}`);
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected)
    throw new Error(
      `${msg} (expected ${String(expected)}, got ${String(actual)})`,
    );
}

const EXPECTED_TOOLS = [
  "add_comment",
  "complete_task",
  "create_project",
  "create_task",
  "get_task",
  "list_projects",
  "list_tasks",
  "move_task",
  "reopen_task",
  "update_task",
].sort();

// --- client + cleanup tracking ----------------------------------------------

const runPrefix = `mcp-smoke-${Date.now()}`;
const projectIds: string[] = [];
const entityIds: string[] = [];

const client = new Client({ name: "tasks-mcp-smoke", version: "0.1.0" });
const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
  requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
});

/** Call a tool and parse its JSON text payload, failing on tool errors. */
async function callJson<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = (await client.callTool({
    name,
    arguments: args,
  })) as CallToolResult;
  const block = result.content[0];
  const text = block && block.type === "text" ? block.text : "";
  if (result.isError) throw new Error(`tool ${name} errored: ${text}`);
  return JSON.parse(text) as T;
}

async function rawStatus(headers: Record<string, string>): Promise<number> {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  // Drain the body so the connection can close cleanly.
  await res.text();
  return res.status;
}

async function main() {
  console.log(`\nmcp smoke ${runPrefix} -> ${MCP_URL}\n`);

  // == auth ==================================================================
  console.log("== auth ==");
  await check("request without a token is 401", async () => {
    assertEqual(await rawStatus({}), 401, "status");
  });
  await check("request with a wrong token is 401", async () => {
    assertEqual(await rawStatus({ Authorization: "Bearer wrong" }), 401, "status");
  });

  // == connect + tools =======================================================
  console.log("== tools ==");
  await client.connect(transport);
  await check("lists exactly the expected tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assertEqual(names.join(","), EXPECTED_TOOLS.join(","), "tool names");
  });

  // == create -> list -> complete -> verify ==================================
  console.log("== flow ==");
  const project = await callJson<SerializedProject>("create_project", {
    name: `${runPrefix} project`,
  });
  projectIds.push(project.id);
  entityIds.push(project.id);

  const task = await callJson<SerializedTask>("create_task", {
    content: `${runPrefix} task`,
    project_name: project.name,
    priority: 1,
    due_iso: "2026-06-20",
  });
  entityIds.push(task.id);

  await check("create_task lands in the named project, all-day p1", () => {
    assertEqual(task.project_id, project.id, "project_id");
    assertEqual(task.priority, 1, "priority");
    assertEqual(task.due_iso, "2026-06-20", "due_iso round-trip");
    assertEqual(task.all_day, true, "all_day");
    assertEqual(task.completed, false, "starts incomplete");
  });

  await check("list_tasks by project includes the new task", async () => {
    const listed = await callJson<SerializedTask[]>("list_tasks", {
      project_name: project.name,
    });
    assert(
      listed.some((t) => t.id === task.id),
      "task missing from project listing",
    );
  });

  await check("complete_task marks it complete", async () => {
    const res = await callJson<{
      task: SerializedTask;
      completed_subtasks: number;
    }>("complete_task", { task_id: task.id });
    assertEqual(res.task.completed, true, "completed flag");
    assertEqual(res.completed_subtasks, 0, "no subtasks");
  });

  await check("get_task confirms the completed state", async () => {
    const fetched = await callJson<SerializedTask>("get_task", {
      task_id: task.id,
    });
    assertEqual(fetched.completed, true, "completed");
  });

  await check("default project listing hides the completed task", async () => {
    const open = await callJson<SerializedTask[]>("list_tasks", {
      project_name: project.name,
    });
    assert(!open.some((t) => t.id === task.id), "completed task still listed");
  });

  // == natural-language quick capture (text shortcut) ========================
  console.log("== text capture ==");
  // Run-prefixed names so the auto-created project/label clean up and never
  // clobber real data.
  const finName = `${runPrefix} fin`;
  const adminLabel = `${runPrefix}-admin`;
  const captured = await callJson<SerializedTask>("create_task", {
    text: `${runPrefix} pay rent tomorrow 9am p2 #"${finName}" @${adminLabel}`,
  });
  entityIds.push(captured.id);
  projectIds.push(captured.project_id); // auto-created project → delete by id
  entityIds.push(captured.project_id);

  await check("create_task text parses a fully structured task", () => {
    assertEqual(captured.content, `${runPrefix} pay rent`, "parsed title");
    assertEqual(captured.priority, 2, "parsed priority");
    assertEqual(captured.all_day, false, "parsed a timed due date");
    assert(
      captured.due_iso?.endsWith("T09:00") ?? false,
      `due time 09:00 (got ${captured.due_iso})`,
    );
    assert(captured.project_id.length > 0, "filed under the parsed project");
    assert(
      captured.labels.includes(adminLabel),
      "attached the auto-created label",
    );
  });

  await check("text shortcut auto-created the named project", async () => {
    const projects = await callJson<SerializedProject[]>("list_projects", {});
    assert(
      projects.some((p) => p.id === captured.project_id),
      "auto-created project missing from list_projects",
    );
  });
}

main()
  .catch((error) => {
    failures.push({ name: "fatal: mcp smoke aborted", error });
    console.error("\nFATAL:", error);
  })
  .finally(async () => {
    try {
      await transport.close();
    } catch {
      // ignore: transport may never have opened
    }
    try {
      await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
      await prisma.activityEvent.deleteMany({
        where: { entityId: { in: entityIds } },
      });
      // Labels auto-created by the text-capture case are named with the run
      // prefix, so they're safe to sweep without touching real labels.
      await prisma.label.deleteMany({
        where: { name: { startsWith: runPrefix } },
      });
    } catch (error) {
      console.error("cleanup failed:", error);
    }
    await prisma.$disconnect();

    console.log(`\n${passed} passed, ${failures.length} failed`);
    for (const f of failures) {
      const msg = f.error instanceof Error ? f.error.message : String(f.error);
      console.log(`  ✗ ${f.name}: ${msg}`);
    }
    process.exitCode = failures.length > 0 ? 1 : 0;
  });
