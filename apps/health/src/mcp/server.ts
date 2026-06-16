import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { dayOf } from "@/lib/dates";
import { daySchema } from "@/lib/schemas/common";
import { trendMetricSchema } from "@/lib/schemas/summary";
import { DomainError, NotFoundError } from "@/server/services/errors";
import { logFood, searchFoodLog } from "@/server/services/food";
import {
  getHistory,
  logSet,
  suggestExercises,
} from "@/server/services/lifting";
import { searchProducts } from "@/server/services/off";
import { logStimulant } from "@/server/services/stimulants";
import { logSupplement } from "@/server/services/supplements";
import { getDailySummary, getTrends } from "@/server/services/summary";
import { syncOura } from "@/server/services/sync/oura";
import { getSyncStatus } from "@/server/services/sync/runs";
import { syncWithings } from "@/server/services/sync/withings";
import { getWaterStatus, logWater } from "@/server/services/water";

// The active_kcal honesty caveat (CLAUDE.md domain guardrail), shared verbatim by the
// two tools that surface device energy expenditure.
const ACTIVE_KCAL_CAVEAT =
  "active_kcal is a wearable trend estimate (error can exceed 27–90%) — treat as " +
  "relative signal, never absolute truth; intake and expenditure are separate " +
  "metrics, do not net them.";

function ok(result: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
}

function fail(error: string, extra?: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error, ...extra }) }],
    isError: true,
  };
}

/** Run a tool body, translating service errors into tool errors. Zod parse failures
 *  (services validate their own input) → invalid input; domain errors → their message. */
async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return fail("invalid input", { issues: err.flatten() });
    }
    if (err instanceof DomainError) return fail(err.message);
    console.error(err);
    return fail("internal error");
  }
}

/**
 * A fresh MCP server with every health tool registered. Tools are thin wrappers over
 * src/server/services (no business logic here); all writes are tagged origin "MCP".
 * Argument names are snake_case for the agent; they map to the services' camelCase
 * inputs, which the services themselves validate against the canonical Zod schemas.
 */
export function buildServer(): McpServer {
  const server = new McpServer({ name: "health", version: "0.1.0" });

  // ----- READ -----

  server.registerTool(
    "get_daily_summary",
    {
      description:
        "The health summary for a day: weight, sleep, readiness, steps, intake " +
        "(kcal/protein/carb/fat), water vs target, caffeine, lifting volume, supplements. " +
        `Returns null if no source data exists yet. ${ACTIVE_KCAL_CAVEAT}`,
      inputSchema: {
        day: daySchema
          .optional()
          .describe("Civil date YYYY-MM-DD (Europe/Amsterdam). Defaults to today."),
      },
    },
    ({ day }) => run(() => getDailySummary(day)),
  );

  server.registerTool(
    "get_trends",
    {
      description:
        "A single metric's daily series over the last N days (days with no value are " +
        `omitted). For active_kcal: ${ACTIVE_KCAL_CAVEAT}`,
      inputSchema: {
        metric: trendMetricSchema.describe("Which metric to chart."),
        days: z
          .number()
          .int()
          .min(1)
          .max(365)
          .default(30)
          .describe("How many days back, 1–365 (default 30)."),
      },
    },
    ({ metric, days }) => run(() => getTrends(metric, days)),
  );

  server.registerTool(
    "get_water_status",
    {
      description:
        "Water logged vs the day's deterministic target (base + caffeine adjustment): " +
        "{ day, waterMl, targetMl, remainingMl }.",
      inputSchema: {
        day: daySchema
          .optional()
          .describe("Civil date YYYY-MM-DD. Defaults to today."),
      },
    },
    ({ day }) => run(() => getWaterStatus(day)),
  );

  server.registerTool(
    "get_lifting_history",
    {
      description:
        "Recent sessions containing an exercise (newest first), with that exercise's " +
        "sets and working-set volume per session. Errors if the exercise name is unknown.",
      inputSchema: {
        exercise: z
          .string()
          .min(1)
          .describe("Exercise name (case-insensitive exact match)."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(5)
          .describe("How many recent sessions to return (default 5)."),
      },
    },
    ({ exercise, limit }) => run(() => getHistory(exercise, limit)),
  );

  server.registerTool(
    "search_food_log",
    {
      description:
        "Food entries logged on a day, optionally filtered by a text query matching the " +
        "custom name or cached product name (case-insensitive).",
      inputSchema: {
        day: daySchema
          .optional()
          .describe("Civil date YYYY-MM-DD. Defaults to today."),
        query: z
          .string()
          .min(1)
          .optional()
          .describe("Substring to match against the entry/product name."),
      },
    },
    ({ day, query }) => run(() => searchFoodLog({ day, query })),
  );

  server.registerTool(
    "get_sync_status",
    {
      description:
        "The most recent sync run per source (Oura, Withings, Google Health). " +
        "Empty until sync phases land.",
      inputSchema: {},
    },
    () => run(() => getSyncStatus()),
  );

  // ----- WRITE (origin "MCP") -----

  server.registerTool(
    "log_water",
    {
      description:
        "Log water intake in milliliters. Returns the created entry and the day's " +
        "updated water status.",
      inputSchema: {
        amount_ml: z
          .number()
          .int()
          .describe("Amount in milliliters (positive, ≤ 5000)."),
      },
    },
    ({ amount_ml }) =>
      run(async () => {
        const entry = await logWater({ amountMl: amount_ml }, "MCP");
        const status = await getWaterStatus(dayOf(entry.loggedAt));
        return { entry, status };
      }),
  );

  server.registerTool(
    "log_stimulant",
    {
      description:
        "Log a stimulant dose in milligrams. Caffeine raises the day's water target; " +
        "returns the day's UPDATED water target in mL so you can report it.",
      inputSchema: {
        amount_mg: z.number().describe("Dose in milligrams (positive, ≤ 2000)."),
        substance: z
          .string()
          .default("caffeine")
          .describe("Substance name (default caffeine)."),
      },
    },
    ({ amount_mg, substance }) =>
      run(async () => {
        const waterTargetMl = await logStimulant(
          { amountMg: amount_mg, substance },
          "MCP",
        );
        return { loggedMg: amount_mg, substance, waterTargetMl };
      }),
  );

  server.registerTool(
    "log_supplement",
    {
      description: "Log a supplement taken (e.g. creatine, dose 5, unit g).",
      inputSchema: {
        name: z.string().describe("Supplement name."),
        dose: z.number().describe("Dose amount (positive)."),
        unit: z.string().describe("Dose unit, e.g. g, mg, IU, capsule."),
      },
    },
    ({ name, dose, unit }) => run(() => logSupplement({ name, dose, unit }, "MCP")),
  );

  server.registerTool(
    "log_food",
    {
      description:
        "Log food in one of three deterministic modes. " +
        "(1) barcode given → resolves the product and logs it, scaling macros by quantity_g. " +
        "(2) name only, no kcal → does NOT log; returns up to 5 Open Food Facts candidates " +
        "{ name, brand, barcode } — pick one and re-call with its barcode. " +
        "(3) name + kcal → logs a custom entry with the provided macros. " +
        "quantity_g is grams; meal is optional.",
      inputSchema: {
        barcode: z
          .string()
          .optional()
          .describe("Numeric product barcode (6–14 digits)."),
        name: z
          .string()
          .optional()
          .describe("Food name — for a custom entry or to search Open Food Facts."),
        quantity_g: z.number().describe("Amount in grams (positive, ≤ 5000)."),
        kcal: z
          .number()
          .optional()
          .describe("Calories for this quantity (required for a custom entry)."),
        protein_g: z.number().optional().describe("Protein grams (override)."),
        carb_g: z.number().optional().describe("Carbohydrate grams (override)."),
        fat_g: z.number().optional().describe("Fat grams (override)."),
        meal: z
          .enum(["BREAKFAST", "LUNCH", "DINNER", "SNACK"])
          .optional()
          .describe("Which meal this belongs to."),
      },
    },
    ({ barcode, name, quantity_g, kcal, protein_g, carb_g, fat_g, meal }) =>
      run(async () => {
        if (barcode != null) {
          return await logFood(
            {
              barcode,
              quantityG: quantity_g,
              meal,
              kcal,
              proteinG: protein_g,
              carbG: carb_g,
              fatG: fat_g,
            },
            "MCP",
          );
        }
        if (name != null && kcal == null) {
          const candidates = await searchProducts(name, 5);
          return {
            logged: false,
            message:
              "No kcal provided. Pick a candidate and re-call log_food with its barcode.",
            candidates: candidates.map((c) => ({
              name: c.name,
              brand: c.brand,
              barcode: c.barcode,
            })),
          };
        }
        if (name != null) {
          return await logFood(
            {
              customName: name,
              quantityG: quantity_g,
              kcal,
              proteinG: protein_g,
              carbG: carb_g,
              fatG: fat_g,
              meal,
            },
            "MCP",
          );
        }
        throw new DomainError(
          "provide a barcode, or a name (optionally with kcal for a custom entry)",
        );
      }),
  );

  server.registerTool(
    "log_lifting_set",
    {
      description:
        "Log a single lifting set. Reuses the current auto-session (a set logged within " +
        "3h of the last one joins that session). Unknown exercise names error with nearest " +
        "matches — exercises are never auto-created.",
      inputSchema: {
        exercise: z
          .string()
          .min(1)
          .describe("Exercise name (must already exist; case-insensitive)."),
        reps: z.number().int().describe("Repetitions (1–100)."),
        weight_kg: z.number().describe("Weight in kilograms (0–500)."),
        rpe: z.number().optional().describe("Rate of perceived exertion (1–10)."),
        is_warmup: z
          .boolean()
          .optional()
          .describe("Whether this is a warmup set (default false)."),
      },
    },
    async ({ exercise, reps, weight_kg, rpe, is_warmup }) => {
      try {
        const set = await logSet(
          {
            exerciseName: exercise,
            reps,
            weightKg: weight_kg,
            rpe,
            isWarmup: is_warmup ?? false,
          },
          "MCP",
        );
        return ok(set);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return fail("invalid input", { issues: err.flatten() });
        }
        if (err instanceof NotFoundError) {
          const matches = await suggestExercises(exercise);
          return fail(err.message, {
            nearestMatches: matches.map((m) => m.name),
          });
        }
        if (err instanceof DomainError) return fail(err.message);
        console.error(err);
        return fail("internal error");
      }
    },
  );

  server.registerTool(
    "trigger_sync",
    {
      description:
        "Trigger a wearable sync for a source since the last successful run (idempotent " +
        "UPSERT by external id / day), returning a run summary { status, itemsUpserted, " +
        "window }. Oura pulls sleep, daily sleep and readiness. Withings pulls body " +
        "measurements (weight + composition); a rejected refresh token returns " +
        "needsReauth: true rather than erroring out. Google Health has not landed yet.",
      inputSchema: {
        source: z
          .enum(["oura", "withings", "google_health"])
          .describe("Which source to sync."),
      },
    },
    ({ source }) => {
      if (source === "oura") return run(() => syncOura());
      if (source === "withings") return run(() => syncWithings());
      return ok({ source, status: "not implemented yet" });
    },
  );

  return server;
}
