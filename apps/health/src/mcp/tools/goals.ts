// Goal-based calorie-target tools — thin wrappers over src/server/services/goals.
// The one write (accepting a weekly proposal) is tagged origin "MCP".

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { decideCheckIn, getGoalStatus } from "@/server/services/goals";
import { run } from "./shared";

export function registerGoalsTools(server: McpServer): void {
  server.registerTool(
    "get_goal_status",
    {
      description:
        "Goal-based calorie-target status: the ACTIVE goal (phase CUT/BULK/MAINTAIN, " +
        "goal weight, target date, currentTargetKcal, trend weight, planned rate " +
        "kg/wk, progress, next check-in day, completion state), the last finished " +
        "goal, and the weekly check-in history. The daily target derives from the " +
        "EMPIRICAL TDEE and the measured weight trend ONLY — never wearable/device " +
        "calories, and intake is never netted against expenditure. Weekly check-ins " +
        "compare the actual trend to plan and propose a capped adjustment " +
        "(default ±150 kcal). paused=true means TDEE confidence is low: the stored " +
        "target stays displayed frozen and check-ins are paused until logging is " +
        "consistent again — do not guess or extrapolate a target. Completion is " +
        "never automatic; reaching the goal only surfaces a MAINTAIN-at-TDEE " +
        "suggestion. Read-only.",
      inputSchema: {},
    },
    () => run(() => getGoalStatus()),
  );

  server.registerTool(
    "accept_checkin_proposal",
    {
      description:
        "Accept a PROPOSED weekly goal check-in: sets the goal's daily target to the " +
        "proposal's proposedTargetKcal (stamped origin MCP). The proposal was derived " +
        "from the actual vs planned WEIGHT TREND only — never device calories — and " +
        "is capped to the weekly adjustment limit. Confirm with the user before " +
        "accepting. Errors when the check-in is unknown, already decided, or the " +
        "goal is no longer active. Use get_goal_status to find PROPOSED check-ins; " +
        "dismissing is done in the UI.",
      inputSchema: {
        checkin_id: z
          .string()
          .describe("The PROPOSED check-in's id (from get_goal_status)."),
      },
    },
    ({ checkin_id }) => run(() => decideCheckIn(checkin_id, "accept", "MCP")),
  );
}
