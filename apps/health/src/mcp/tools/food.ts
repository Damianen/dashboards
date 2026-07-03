// Food tools: diary search, recents, saved meals and daily plans, custom
// foods, the two vision draft tools, the food/meal/plan write paths, and
// single-entry diary corrections. All writes are tagged origin "MCP".

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { todayLocal } from "@/lib/dates";
import { MEAL_ORDER } from "@/lib/food";
import { daySchema } from "@/lib/schemas/common";
import {
  per100gSchema,
  recentLoggablesQuerySchema,
  updateFoodEntrySchema,
} from "@/lib/schemas/food";
import type { MealItemInput } from "@/lib/schemas/meals";
import { imageDataUrlSchema } from "@/lib/schemas/vision";
import {
  applyDailyPlan,
  listDailyPlans,
  resolveDailyPlanByName,
} from "@/server/services/dailyPlans";
import { DomainError } from "@/server/services/errors";
import {
  createCustomFood,
  deleteEntry,
  estimateMeal,
  listRecentLoggables,
  logFood,
  resolveCustomFoodByName,
  scanLabel,
  searchFoodLog,
  updateFoodEntry,
} from "@/server/services/food";
import {
  createMeal,
  listMeals,
  logMeal,
  resolveMealByName,
} from "@/server/services/meals";
import { searchProducts } from "@/server/services/off";

import { run } from "./shared";

export function registerFoodTools(server: McpServer): void {
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
    "list_recent_foods",
    {
      description:
        "Recently logged DISTINCT foods (barcode products and saved custom foods), " +
        "newest first, each with the quantity last used (lastQuantityG). The fastest " +
        "way to resolve a food the user has eaten before: re-log one by calling " +
        "log_food with its barcode or custom food name and the last quantity.",
      inputSchema: {
        // The route's schema is the single source of the bounds/default.
        limit: recentLoggablesQuerySchema.shape.limit.describe(
          "How many distinct foods to return (default 8).",
        ),
      },
    },
    ({ limit }) => run(() => listRecentLoggables(limit)),
  );

  server.registerTool(
    "list_meals",
    {
      description:
        "Saved meals (recipes), alphabetical. Each has a yield (the number of portions " +
        "the recipe makes) and snapshotted per-portion macros (perPortion + perPortionKcal). " +
        "Use log_meal to log one to the diary by name.",
      inputSchema: {
        include_archived: z
          .boolean()
          .optional()
          .describe("Include archived meals (default false)."),
      },
    },
    ({ include_archived }) =>
      run(() => listMeals({ includeArchived: include_archived })),
  );

  server.registerTool(
    "list_daily_plans",
    {
      description:
        'Saved daily plans — named, reusable sets of food/meal items eaten on a typical ' +
        'day (e.g. "Workday", "Rest day"), alphabetical. Each shows its item count and ' +
        "the plan's current total kcal. Use apply_daily_plan to log one to a day's diary " +
        "by name.",
      inputSchema: {
        include_archived: z
          .boolean()
          .optional()
          .describe("Include archived plans (default false)."),
      },
    },
    ({ include_archived }) =>
      run(() => listDailyPlans({ includeArchived: include_archived })),
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
        // The canonical per-100g schema (camelCase keys), shared with the routes and
        // matching the draft shape scan_nutrition_label returns — pass it through as-is.
        per100g: per100gSchema.describe(
          "Macros per 100 g, camelCase: kcal, proteinG, carbG, fatG required; " +
            "fiberG, sugarG, saltG optional grams; caffeineMg optional caffeine in " +
            "MILLIGRAMS per 100 g (feeds the day's caffeine total / water target " +
            "when logged; never calories).",
        ),
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
          per100g,
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
        image_data_url: imageDataUrlSchema.describe(
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
        image_data_url: imageDataUrlSchema.describe(
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
        "meal is optional; protein_g/carb_g/fat_g override the resolved macros. " +
        "caffeine_mg (for this quantity) overrides the resolved caffeine and raises the " +
        "day's caffeine total + water target; it never affects calories.",
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
        caffeine_mg: z
          .number()
          .optional()
          .describe(
            "Caffeine mg for this quantity (override). Raises the day's caffeine " +
              "total + water target; never affects calories.",
          ),
        meal: z
          .enum(MEAL_ORDER)
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
      caffeine_mg,
      meal,
    }) =>
      run(async () => {
        const overrides = {
          quantityG: quantity_g,
          kcal,
          proteinG: protein_g,
          carbG: carb_g,
          fatG: fat_g,
          caffeineMg: caffeine_mg,
          meal,
        };
        if (barcode != null) {
          return await logFood({ barcode, ...overrides }, "MCP");
        }
        if (custom_food_name != null) {
          const resolved = await resolveCustomFoodByName(custom_food_name);
          if ("food" in resolved) {
            return await logFood(
              { customFoodId: resolved.food.id, ...overrides },
              "MCP",
            );
          }
          if (resolved.candidates.length === 0) {
            throw new DomainError(
              `no custom food matches "${custom_food_name}"`,
            );
          }
          return {
            logged: false,
            message:
              "Multiple custom foods match. Re-call log_food with an exact name.",
            candidates: resolved.candidates,
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
    "update_food_entry",
    {
      description:
        "Correct a logged diary entry IN PLACE — get ids from search_food_log. " +
        "quantity_g rescales the entry's OWN snapshotted macros proportionally " +
        "(per-gram = stored totals ÷ stored quantity); the product/custom-food " +
        "cache is NEVER re-read, so history stays a snapshot even if the source " +
        "changed since. Entries logged from a saved meal are measured in PORTIONS " +
        "(no gram quantity) and refuse quantity edits with an error — delete the " +
        "entry and re-log via log_meal instead. meal: null moves the entry to the " +
        "'Other' group; notes: null clears the note. Provide at least one field " +
        "besides id. Returns the updated entry.",
      inputSchema: {
        id: z.cuid().describe("The food entry id to edit."),
        // The canonical update schema's fields (single source of truth with the
        // PATCH /api/food/entries/[id] route).
        quantity_g: updateFoodEntrySchema.shape.quantityG.describe(
          "New amount in grams (positive, ≤ 5000) — rescales the snapshot.",
        ),
        meal: updateFoodEntrySchema.shape.meal.describe(
          "Move to this meal slot; null moves it to the 'Other' group.",
        ),
        notes: updateFoodEntrySchema.shape.notes.describe(
          "Replace the note; null clears it.",
        ),
      },
    },
    ({ id, quantity_g, meal, notes }) =>
      run(() => updateFoodEntry(id, { quantityG: quantity_g, meal, notes })),
  );

  server.registerTool(
    "delete_food_entry",
    {
      description:
        "Delete ONE mistaken food entry by id — get ids from search_food_log. " +
        "Removes that entry's macros/caffeine from the day's totals. Single-entry " +
        "correction only; there is deliberately no bulk delete. Not undoable — " +
        "re-log via log_food/log_meal if deleted in error.",
      inputSchema: {
        id: z.cuid().describe("The food entry id to delete."),
      },
    },
    ({ id }) =>
      run(async () => {
        await deleteEntry(id);
        return { deleted: true, id };
      }),
  );

  server.registerTool(
    "log_meal",
    {
      description:
        "Log a SAVED meal (recipe) to the diary as ONE combined entry. Resolves the meal " +
        "by case-insensitive name: an exact single match logs it, scaling the recipe's " +
        "per-portion macros by `portions` (fractional allowed, e.g. 1.5); multiple or no " +
        "matches do NOT log and return { logged: false, candidates: [{ id, name }] } — " +
        "re-call with an exact name. Macros are snapshotted at log time, so later recipe " +
        "edits never change this entry. Use list_meals to see what's available.",
      inputSchema: {
        meal: z.string().describe("Name of the saved meal to log."),
        portions: z
          .number()
          .describe("Portions to log (positive; fractional allowed, e.g. 1.5)."),
        meal_slot: z
          .enum(MEAL_ORDER)
          .optional()
          .describe("Which meal slot this belongs to."),
        eaten_at: z
          .string()
          .optional()
          .describe("ISO 8601 timestamp with offset; defaults to now."),
      },
    },
    ({ meal, portions, meal_slot, eaten_at }) =>
      run(async () => {
        const resolved = await resolveMealByName(meal);
        if (!("meal" in resolved)) {
          return {
            logged: false,
            message:
              resolved.candidates.length === 0
                ? `no meal matches "${meal}"`
                : "Multiple meals match. Re-call log_meal with an exact name.",
            candidates: resolved.candidates,
          };
        }
        return await logMeal(
          {
            mealId: resolved.meal.id,
            portions,
            meal: meal_slot,
            eatenAt: eaten_at,
          },
          "MCP",
        );
      }),
  );

  server.registerTool(
    "apply_daily_plan",
    {
      description:
        "Apply a saved daily plan to a day's diary: logs EACH of its items as its own " +
        "ordinary, separately-editable entry (products/custom foods via the food path, " +
        "meals via the meal path), snapshotting macros exactly like a manual log, in the " +
        "items' own meal slots. Resolves the plan by case-insensitive name: an exact " +
        "single match applies it; multiple or no matches do NOT apply and return " +
        "{ applied: false, candidates: [{ id, name }] } — re-call with an exact name. " +
        "Stateless and repeatable: it never dedups, so applying twice logs two sets " +
        "(delete extras manually). Returns { logged, skipped: [{ item, reason }] } — a " +
        "since-deleted item is skipped while the rest still log. Intake only; never " +
        "netted against expenditure.",
      inputSchema: {
        plan: z.string().describe("Name of the saved daily plan to apply."),
        day: daySchema
          .optional()
          .describe(
            "Civil date YYYY-MM-DD (Europe/Amsterdam). Defaults to today.",
          ),
      },
    },
    ({ plan, day }) =>
      run(async () => {
        const resolved = await resolveDailyPlanByName(plan);
        if (!("plan" in resolved)) {
          return {
            applied: false,
            message:
              resolved.candidates.length === 0
                ? `no daily plan matches "${plan}"`
                : "Multiple plans match. Re-call apply_daily_plan with an exact name.",
            candidates: resolved.candidates,
          };
        }
        return await applyDailyPlan(resolved.plan.id, day ?? todayLocal(), "MCP");
      }),
  );

  server.registerTool(
    "create_meal",
    {
      description:
        "Create a SAVED meal (recipe) from a yield (portions it makes) and a list of " +
        "items. Each item has exactly one source: barcode (OFF product, with quantity_g), " +
        "custom_food_name (a saved custom food, with quantity_g), name (a free-typed item " +
        "with kcal + macros), or child_meal_name (another saved meal nested in, with " +
        "child_portions). custom_food_name and child_meal_name are resolved by name — an " +
        "ambiguous/unknown name returns { created: false, candidates } and saves NOTHING. " +
        "Nested-meal macros are folded in at save time (a snapshot). Does NOT log anything " +
        "— call log_meal to log it.",
      inputSchema: {
        name: z.string().describe("Name of the meal (recipe)."),
        yield_portions: z
          .number()
          .describe("How many portions this recipe makes (positive)."),
        notes: z.string().optional().describe("Optional notes."),
        items: z
          .array(
            z.object({
              barcode: z
                .string()
                .optional()
                .describe("Numeric barcode of an OFF product."),
              custom_food_name: z
                .string()
                .optional()
                .describe("Name of a saved custom food."),
              name: z
                .string()
                .optional()
                .describe("Free-typed item name (provide kcal + macros)."),
              child_meal_name: z
                .string()
                .optional()
                .describe("Name of another saved meal to nest."),
              quantity_g: z
                .number()
                .optional()
                .describe("Grams (for barcode / custom_food_name / free-typed name)."),
              child_portions: z
                .number()
                .optional()
                .describe("Sub-meal portions (for child_meal_name)."),
              kcal: z
                .number()
                .optional()
                .describe("Calories (required for a free-typed name item)."),
              protein_g: z.number().optional().describe("Protein grams."),
              carb_g: z.number().optional().describe("Carbohydrate grams."),
              fat_g: z.number().optional().describe("Fat grams."),
              fiber_g: z.number().optional().describe("Fiber grams."),
              sugar_g: z.number().optional().describe("Sugar grams."),
              salt_g: z.number().optional().describe("Salt grams."),
              caffeine_mg: z
                .number()
                .optional()
                .describe(
                  "Caffeine mg for a free-typed item; barcode/custom-food/child-meal " +
                    "items inherit caffeine from their source.",
                ),
            }),
          )
          .describe("Ingredients — exactly one source per item."),
      },
    },
    ({ name, yield_portions, notes, items }) =>
      run(async () => {
        const resolvedItems: MealItemInput[] = [];
        for (const it of items) {
          if (it.barcode != null) {
            resolvedItems.push({ barcode: it.barcode, quantityG: it.quantity_g });
          } else if (it.custom_food_name != null) {
            const cfn = it.custom_food_name;
            const resolved = await resolveCustomFoodByName(cfn);
            if (!("food" in resolved)) {
              return {
                created: false,
                message:
                  resolved.candidates.length === 0
                    ? `no custom food matches "${cfn}"`
                    : `multiple custom foods match "${cfn}"; use an exact name`,
                candidates: resolved.candidates,
              };
            }
            resolvedItems.push({
              customFoodId: resolved.food.id,
              quantityG: it.quantity_g,
            });
          } else if (it.child_meal_name != null) {
            const resolved = await resolveMealByName(it.child_meal_name);
            if (!("meal" in resolved)) {
              return {
                created: false,
                message:
                  resolved.candidates.length === 0
                    ? `no meal matches "${it.child_meal_name}"`
                    : `multiple meals match "${it.child_meal_name}"; use an exact name`,
                candidates: resolved.candidates,
              };
            }
            resolvedItems.push({
              childMealId: resolved.meal.id,
              childPortions: it.child_portions,
            });
          } else if (it.name != null) {
            resolvedItems.push({
              customName: it.name,
              quantityG: it.quantity_g,
              kcal: it.kcal,
              proteinG: it.protein_g,
              carbG: it.carb_g,
              fatG: it.fat_g,
              fiberG: it.fiber_g,
              sugarG: it.sugar_g,
              saltG: it.salt_g,
              caffeineMg: it.caffeine_mg,
            });
          } else {
            throw new DomainError(
              "each item needs a barcode, custom_food_name, name, or child_meal_name",
            );
          }
        }
        return await createMeal({
          name,
          yieldPortions: yield_portions,
          notes,
          items: resolvedItems,
        });
      }),
  );
}
