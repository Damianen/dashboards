import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerAdminTools } from "./tools/admin";
import { registerExportTools } from "./tools/export";
import { registerFoodTools } from "./tools/food";
import { registerGoalsTools } from "./tools/goals";
import { registerInsightsTools } from "./tools/insights";
import { registerLiftingTools } from "./tools/lifting";
import { registerSettingsTools } from "./tools/settings";
import { registerTrackingTools } from "./tools/tracking";
import { registerWorkoutsTools } from "./tools/workouts";

/**
 * A fresh MCP server with every health tool registered. Tools are thin wrappers over
 * src/server/services (no business logic here); all writes are tagged origin "MCP".
 * Argument names are snake_case for the agent; they map to the services' camelCase
 * inputs, which the services themselves validate against the canonical Zod schemas.
 */
export function buildServer(): McpServer {
  const server = new McpServer({ name: "health", version: "0.1.0" });

  registerInsightsTools(server);
  registerGoalsTools(server);
  registerTrackingTools(server);
  registerFoodTools(server);
  registerLiftingTools(server);
  registerWorkoutsTools(server);
  registerSettingsTools(server);
  registerExportTools(server);
  registerAdminTools(server);

  return server;
}
