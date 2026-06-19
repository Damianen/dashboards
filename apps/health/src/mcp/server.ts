import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { dayOf } from "@/lib/dates";
import { daySchema } from "@/lib/schemas/common";
import { trendMetricSchema } from "@/lib/schemas/summary";
import { DomainError, NotFoundError } from "@/server/services/errors";
import {
  createCustomFood,
  estimateMeal,
  logFood,
  scanLabel,
  searchCustomFoods,
  searchFoodLog,
} from "@/server/services/food";
import {
  getHistory,
  getSession,
  listSessions,
  logSet,
  suggestExercises,
} from "@/server/services/lifting";
import { searchProducts } from "@/server/services/off";
import {
  listTemplates,
  startSessionFromTemplate,
} from "@/server/services/templates";
import { logStimulant } from "@/server/services/stimulants";
import { logSupplement } from "@/server/services/supplements";
import { getDailySummary, getTrends } from "@/server/services/summary";
import { VisionError } from "@/server/services/vision";
import { syncOura } from "@/server/services/sync/oura";
import { latestRunsBySource } from "@/server/services/sync/runs";
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
    // VisionError is an upstream provider/parse failure; its message is already
    // generic (never leaks the image or API key), so surface it to the agent.
    if (err instanceof VisionError) return fail(err.message);
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
    "list_workout_templates",
    {
      description:
        "Workout templates with their exercises and per-exercise targets, in plan " +
        'order — so you can read a plan like "Push Day A: Bench 4×6–10, …". A REPS ' +
        "target gives sets + a rep range (+ optional working weight); a VOLUME target " +
        "gives a Σ reps×weight goal. Excludes archived templates unless " +
        "include_archived is true.",
      inputSchema: {
        include_archived: z
          .boolean()
          .optional()
          .describe("Include archived templates too (default false)."),
      },
    },
    ({ include_archived }) =>
      run(() => listTemplates({ includeArchived: include_archived ?? false })),
  );

  server.registerTool(
    "get_session_progress",
    {
      description:
        "A lifting session's plan vs. what's been logged: per exercise, sets done vs " +
        "target, in-range set count, and worked volume vs any volume goal. Unplanned " +
        "exercises that were logged appear with plan null. Without a session_id, uses " +
        "the most recent session today; errors if there is none.",
      inputSchema: {
        session_id: z
          .string()
          .optional()
          .describe("Session id; omit for the most recent session today."),
      },
    },
    ({ session_id }) =>
      run(async () => {
        if (session_id) return getSession(session_id);
        const [latest] = await listSessions(dayOf(new Date()));
        if (!latest) throw new DomainError("no lifting session today");
        return getSession(latest.sessionId);
      }),
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
        "The most recent sync run per source (Oura, Withings). " +
        "Empty until sync phases land.",
      inputSchema: {},
    },
    () => run(() => latestRunsBySource()),
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
    "create_custom_food",
    {
      description:
        "Save a reusable custom food (e.g. a home recipe) from its per-100g macros, so " +
        "it can be logged later by name with log_food. Saved as a MANUAL entry; to " +
        "capture a packaged product, call scan_nutrition_label first for a draft, then " +
        "confirm it here. Returns the created food with its id. Does NOT log anything — " +
        "call log_food with custom_food_name to log it.",
      inputSchema: {
        name: z.string().describe("Display name of the food."),
        brand: z.string().optional().describe("Brand, if any."),
        per100g: z
          .object({
            kcal: z.number().describe("Calories per 100 g."),
            protein_g: z.number().describe("Protein grams per 100 g."),
            carb_g: z.number().describe("Carbohydrate grams per 100 g."),
            fat_g: z.number().describe("Fat grams per 100 g."),
            fiber_g: z.number().optional().describe("Fiber grams per 100 g."),
            sugar_g: z.number().optional().describe("Sugar grams per 100 g."),
            salt_g: z.number().optional().describe("Salt grams per 100 g."),
          })
          .describe("Macros per 100 g."),
        serving_g: z
          .number()
          .optional()
          .describe("Typical serving size in grams, if known."),
      },
    },
    ({ name, brand, per100g, serving_g }) =>
      run(() =>
        createCustomFood({
          name,
          brand,
          per100g: {
            kcal: per100g.kcal,
            proteinG: per100g.protein_g,
            carbG: per100g.carb_g,
            fatG: per100g.fat_g,
            fiberG: per100g.fiber_g,
            sugarG: per100g.sugar_g,
            saltG: per100g.salt_g,
          },
          servingG: serving_g,
          source: "MANUAL",
        }),
      ),
  );

  server.registerTool(
    "scan_nutrition_label",
    {
      description:
        "Read a nutrition-label photo into a DRAFT custom food. Returns { draft (name, " +
        "brand, serving size, and per-100g macros — camelCase, ready for create_custom_food), " +
        "confidence, notes }. AI vision is an ESTIMATE and OCR can misread, so this persists " +
        "NOTHING: confirm the values with the user, then call create_custom_food (and " +
        "log_food) to save. Provide the image as a data: URL.",
      inputSchema: {
        image_data_url: z
          .string()
          .describe(
            "The label photo as a data: URL (base64; downscale before sending).",
          ),
      },
    },
    ({ image_data_url }) => run(() => scanLabel(image_data_url)),
  );

  server.registerTool(
    "estimate_meal_from_photo",
    {
      description:
        "Estimate the calories and macros of a meal/plate photo — the restaurant / " +
        "no-label fallback. Returns a DRAFT { description, components (each with " +
        "estGrams + kcal/protein/carb/fat), totalKcal/totalProteinG/totalCarbG/totalFatG, " +
        "confidence, assumptions, caveat } and persists NOTHING. These are ROUGH AI " +
        "ESTIMATES (usually 'low' or 'medium' confidence), so confirm and edit the totals " +
        "with the user, then log via log_food with custom_food_name '<description> " +
        "(AI estimate)' and the explicit kcal/macros. Provide the image as a data: URL.",
      inputSchema: {
        image_data_url: z
          .string()
          .describe(
            "The meal photo as a data: URL (base64; downscale before sending).",
          ),
      },
    },
    ({ image_data_url }) => run(() => estimateMeal(image_data_url)),
  );

  server.registerTool(
    "log_food",
    {
      description:
        "Log food in one of four deterministic modes. " +
        "(1) barcode given → resolves the product and logs it, scaling macros by quantity_g. " +
        "(2) custom_food_name given → looks up a SAVED custom food (see create_custom_food); " +
        "an exact single match logs it directly (macros scaled by quantity_g), multiple " +
        "matches do NOT log and return candidates { id, name, brand } — re-call with the " +
        "exact name. (3) name only, no kcal → does NOT log; returns up to 5 Open Food Facts " +
        "candidates { name, brand, barcode } — pick one and re-call with its barcode. " +
        "(4) name + kcal → logs a one-off custom entry with the provided macros. " +
        "Provide exactly one of barcode / custom_food_name / name. quantity_g is grams; " +
        "meal is optional; protein_g/carb_g/fat_g override the resolved macros.",
      inputSchema: {
        barcode: z
          .string()
          .optional()
          .describe("Numeric product barcode (6–14 digits)."),
        custom_food_name: z
          .string()
          .optional()
          .describe("Name of a saved custom food to look up and log."),
        name: z
          .string()
          .optional()
          .describe(
            "Food name — for a one-off custom entry or to search Open Food Facts.",
          ),
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
    ({
      barcode,
      custom_food_name,
      name,
      quantity_g,
      kcal,
      protein_g,
      carb_g,
      fat_g,
      meal,
    }) =>
      run(async () => {
        const overrides = {
          quantityG: quantity_g,
          kcal,
          proteinG: protein_g,
          carbG: carb_g,
          fatG: fat_g,
          meal,
        };
        if (barcode != null) {
          return await logFood({ barcode, ...overrides }, "MCP");
        }
        if (custom_food_name != null) {
          const matches = await searchCustomFoods(custom_food_name);
          const exact = matches.filter(
            (f) => f.name.toLowerCase() === custom_food_name.trim().toLowerCase(),
          );
          // Prefer an exact-name match (a `contains` search can return several);
          // fall back to the sole result when the search itself is unambiguous.
          const chosen =
            exact.length === 1
              ? exact[0]
              : matches.length === 1
                ? matches[0]
                : null;
          if (chosen) {
            return await logFood(
              { customFoodId: chosen.id, ...overrides },
              "MCP",
            );
          }
          if (matches.length === 0) {
            throw new DomainError(
              `no custom food matches "${custom_food_name}"`,
            );
          }
          return {
            logged: false,
            message:
              "Multiple custom foods match. Re-call log_food with an exact name.",
            candidates: matches.map((c) => ({
              id: c.id,
              name: c.name,
              brand: c.brand,
            })),
          };
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
          return await logFood({ customName: name, ...overrides }, "MCP");
        }
        throw new DomainError(
          "provide a barcode, a custom_food_name, or a name (optionally with kcal for a custom entry)",
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
    "start_workout_from_template",
    {
      description:
        "Start a new lifting session by snapshotting a template (matched by name, " +
        "case-insensitive). The session captures the plan at start time — later edits " +
        "or archival of the template never change it. Returns the new session id and " +
        "its plan items. Log actual sets with log_lifting_set; track progress with " +
        "get_session_progress.",
      inputSchema: {
        template: z
          .string()
          .min(1)
          .describe("Template name (case-insensitive exact match)."),
      },
    },
    ({ template }) =>
      run(async () => {
        const templates = await listTemplates({ includeArchived: true });
        const match = templates.find(
          (t) => t.name.toLowerCase() === template.toLowerCase(),
        );
        if (!match) {
          const available = templates
            .filter((t) => !t.archived)
            .map((t) => t.name);
          throw new DomainError(
            `no template named "${template}"; available: ${
              available.length ? available.join(", ") : "(none)"
            }`,
          );
        }
        if (match.archived) {
          throw new DomainError(`template "${match.name}" is archived`);
        }
        return startSessionFromTemplate({ templateId: match.id });
      }),
  );

  server.registerTool(
    "trigger_sync",
    {
      description:
        "Trigger a wearable sync for a source since the last successful run (idempotent " +
        "UPSERT by external id / day), returning a run summary { status, itemsUpserted, " +
        "window }. Oura pulls sleep, daily sleep and readiness; an unlinked Oura or a " +
        "rejected refresh token returns needsReauth: true. Withings pulls body " +
        "measurements (weight + composition); a rejected refresh token returns " +
        "needsReauth: true rather than erroring out.",
      inputSchema: {
        source: z
          .enum(["oura", "withings"])
          .describe("Which source to sync."),
      },
    },
    ({ source }) => {
      if (source === "oura") return run(() => syncOura());
      return run(() => syncWithings());
    },
  );

  return server;
}
