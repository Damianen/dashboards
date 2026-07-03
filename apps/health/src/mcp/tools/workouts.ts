// Workout tools: the read-only Apple-Watch cardio/activity workout list
// (ingested via /api/health-import). Deliberately separate from lifting —
// these are wearable-synced rows and are never mutated over MCP.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { workoutsQuerySchema } from "@/lib/schemas/workout";
import { listWorkouts } from "@/server/services/workouts";

import { ACTIVE_KCAL_CAVEAT, run } from "./shared";

export function registerWorkoutsTools(server: McpServer): void {
  server.registerTool(
    "list_workouts",
    {
      description:
        "Recent Apple-Watch cardio/activity workouts (synced from Apple Health " +
        "— NOT lifting sessions; those live under get_session_progress / " +
        "get_lifting_history), newest first over the last `days` days: { id, " +
        "type, startedAt, day, durationSeconds, distance, activeEnergyKcal, " +
        "avgHeartRate, maxHeartRate }, any field null when the watch didn't " +
        "report it. Read-only — synced rows are never edited or deleted over " +
        `MCP. ${ACTIVE_KCAL_CAVEAT}`,
      inputSchema: {
        // The route's query schema is the single source of the days bound/default.
        days: workoutsQuerySchema.shape.days.describe(
          "How many days back, 1–365 (default 30).",
        ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(50)
          .describe("Max workouts to return, 1–200 (default 50)."),
      },
    },
    ({ days, limit }) => run(() => listWorkouts(days, limit)),
  );
}
