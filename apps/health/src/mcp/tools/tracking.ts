// Manual-tracking tools: water, stimulants, body weight and the supplement
// checklist. All writes are tagged origin "MCP".

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { civilDay, dayOf } from "@/lib/dates";
import { daySchema } from "@/lib/schemas/common";
import { supplementTimeGroupSchema } from "@/lib/schemas/supplement";
import { logWeightSchema } from "@/lib/schemas/weight";
import { DomainError } from "@/server/services/errors";
import {
  deleteStimulantEntry,
  listByDay as listStimulantsByDay,
  logStimulant,
} from "@/server/services/stimulants";
import {
  check,
  checkGroup,
  getChecklist,
  resolveByName,
  uncheck,
  uncheckGroup,
} from "@/server/services/supplements";
import {
  deleteWaterEntry,
  getWaterStatus,
  listWaterByDay,
  logWater,
} from "@/server/services/water";
import { logWeight } from "@/server/services/weight";

import { run } from "./shared";

export function registerTrackingTools(server: McpServer): void {
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
    "list_water_entries",
    {
      description:
        "A day's individual water entries, newest first: { id, loggedAt, day, amountMl, " +
        "origin }. Use the id with delete_water_entry to undo a mistaken log.",
      inputSchema: {
        day: daySchema
          .optional()
          .describe("Civil date YYYY-MM-DD. Defaults to today."),
      },
    },
    ({ day }) =>
      run(async () => {
        const entries = await listWaterByDay(day);
        return entries.map((e) => ({
          id: e.id,
          loggedAt: e.loggedAt.toISOString(),
          day: civilDay(e.day),
          amountMl: e.amountMl,
          origin: e.origin,
        }));
      }),
  );

  server.registerTool(
    "list_stimulant_entries",
    {
      description:
        "A day's individual stimulant entries, newest first: { id, loggedAt, day, " +
        "substance, amountMg, origin, notes }. Use the id with delete_stimulant_entry " +
        "to undo a mistaken log.",
      inputSchema: {
        day: daySchema
          .optional()
          .describe("Civil date YYYY-MM-DD. Defaults to today."),
      },
    },
    ({ day }) =>
      run(async () => {
        const entries = await listStimulantsByDay(day);
        return entries.map((e) => ({
          id: e.id,
          loggedAt: e.loggedAt.toISOString(),
          day: civilDay(e.day),
          substance: e.substance,
          amountMg: Number(e.amountMg),
          origin: e.origin,
          notes: e.notes,
        }));
      }),
  );

  server.registerTool(
    "get_supplement_checklist",
    {
      description:
        "The day's supplement checklist: the three time-groups (MORNING, EVENING, " +
        "PRE_WORKOUT), each active supplement with its dose/unit and whether it's been " +
        "taken (complete) that day, plus per-group done/total counts. Tracking only — " +
        "supplements never enter intake/expenditure or calorie math.",
      inputSchema: {
        day: daySchema
          .optional()
          .describe("Civil date YYYY-MM-DD (Europe/Amsterdam). Defaults to today."),
      },
    },
    ({ day }) => run(() => getChecklist(day)),
  );

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
        const { entry, waterTargetMl } = await logStimulant(
          { amountMg: amount_mg, substance },
          "MCP",
        );
        return {
          entry: {
            id: entry.id,
            day: civilDay(entry.day),
            substance: entry.substance,
            amountMg: Number(entry.amountMg),
          },
          waterTargetMl,
        };
      }),
  );

  server.registerTool(
    "delete_water_entry",
    {
      description:
        "Delete ONE water entry by id (undo a mistaken log — get ids from " +
        "list_water_entries or the log_water response). Returns the entry's day so " +
        "you can re-check that day's water status.",
      inputSchema: {
        id: z.cuid().describe("The water entry id to delete."),
      },
    },
    ({ id }) => run(() => deleteWaterEntry(id)),
  );

  server.registerTool(
    "delete_stimulant_entry",
    {
      description:
        "Delete ONE stimulant entry by id (undo a mistaken log — get ids from " +
        "list_stimulant_entries or the log_stimulant response). Lowers that day's " +
        "water target; returns { id, day, waterTargetMl } with the recomputed target.",
      inputSchema: {
        id: z.cuid().describe("The stimulant entry id to delete."),
      },
    },
    ({ id }) => run(() => deleteStimulantEntry(id)),
  );

  server.registerTool(
    "log_weight",
    {
      description:
        "Log a manual body-weight measurement in kilograms (stored with source MANUAL, " +
        "never touched by wearable syncs). Moves the weight card, 7-day average, " +
        "protein target and weight-goal ETA.",
      inputSchema: {
        weight_kg: logWeightSchema.shape.weightKg.describe(
          "Body weight in kilograms (20–350).",
        ),
        measured_at: logWeightSchema.shape.measuredAt.describe(
          "ISO timestamp with offset. Defaults to now.",
        ),
      },
    },
    ({ weight_kg, measured_at }) =>
      run(async () => {
        const m = await logWeight({
          weightKg: weight_kg,
          measuredAt: measured_at,
        });
        return {
          id: m.id,
          day: civilDay(m.day),
          weightKg: Number(m.weightKg),
          source: m.source,
        };
      }),
  );

  server.registerTool(
    "check_supplement",
    {
      description:
        "Tick a supplement as taken for a day, resolving an ACTIVE supplement by " +
        "case-insensitive name (dose/unit are snapshotted from the list at check time). " +
        "Idempotent — checking again never double-logs. If the name matches several " +
        "active supplements, returns { ambiguous: true, candidates } WITHOUT logging. " +
        "Returns the day's refreshed checklist.",
      inputSchema: {
        name: z
          .string()
          .min(1)
          .describe("Active supplement name (case-insensitive exact match)."),
        day: daySchema
          .optional()
          .describe("Civil date YYYY-MM-DD. Defaults to today."),
      },
    },
    ({ name, day }) =>
      run(async () => {
        const matches = await resolveByName(name);
        const [only] = matches;
        if (!only) {
          throw new DomainError(`no active supplement named "${name}"`);
        }
        if (matches.length > 1) {
          return {
            ambiguous: true,
            candidates: matches.map((m) => ({
              id: m.id,
              name: m.name,
              dose: m.dose,
              unit: m.unit,
              timeGroup: m.timeGroup,
            })),
          };
        }
        return check({ supplementId: only.id, day }, "MCP");
      }),
  );

  server.registerTool(
    "uncheck_supplement",
    {
      description:
        "Untick a supplement (mark it NOT taken) for a day — the undo for a mistaken " +
        "check_supplement. Resolves an ACTIVE supplement by case-insensitive name. " +
        "Idempotent — unchecking an already-unchecked item changes nothing. If the " +
        "name matches several active supplements, returns { ambiguous: true, " +
        "candidates } WITHOUT changing anything — re-call with the exact name. " +
        "Returns the day's refreshed checklist.",
      inputSchema: {
        name: z
          .string()
          .min(1)
          .describe("Active supplement name (case-insensitive exact match)."),
        day: daySchema
          .optional()
          .describe("Civil date YYYY-MM-DD. Defaults to today."),
      },
    },
    ({ name, day }) =>
      run(async () => {
        const matches = await resolveByName(name);
        const [only] = matches;
        if (!only) {
          throw new DomainError(`no active supplement named "${name}"`);
        }
        if (matches.length > 1) {
          return {
            ambiguous: true,
            candidates: matches.map((m) => ({
              id: m.id,
              name: m.name,
              dose: m.dose,
              unit: m.unit,
              timeGroup: m.timeGroup,
            })),
          };
        }
        return uncheck({ supplementId: only.id, day });
      }),
  );

  server.registerTool(
    "check_supplement_group",
    {
      description:
        "Tick every not-yet-taken active supplement in a time-group as taken for a day. " +
        "Idempotent — re-running never double-logs. Returns { newlyChecked, checklist }.",
      inputSchema: {
        time_group: supplementTimeGroupSchema.describe(
          "Which group: MORNING, EVENING, or PRE_WORKOUT.",
        ),
        day: daySchema
          .optional()
          .describe("Civil date YYYY-MM-DD. Defaults to today."),
      },
    },
    ({ time_group, day }) =>
      run(() => checkGroup({ timeGroup: time_group, day }, "MCP")),
  );

  server.registerTool(
    "uncheck_supplement_group",
    {
      description:
        "Untick EVERY checked active supplement in a time-group for a day — the undo " +
        "for a mistaken check_supplement_group. Idempotent — re-running on an " +
        "unchecked group changes nothing. Returns { unchecked (how many were " +
        "removed), checklist } with the day's refreshed checklist.",
      inputSchema: {
        time_group: supplementTimeGroupSchema.describe(
          "Which group: MORNING, EVENING, or PRE_WORKOUT.",
        ),
        day: daySchema
          .optional()
          .describe("Civil date YYYY-MM-DD. Defaults to today."),
      },
    },
    ({ time_group, day }) =>
      run(() => uncheckGroup({ timeGroup: time_group, day })),
  );
}
