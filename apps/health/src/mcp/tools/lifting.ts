// Lifting tools: history, strength and volume reads, the exercise catalog,
// template management (create/edit/duplicate/archive), session progress, and
// the set/session write and correction paths. All writes are tagged origin "MCP".

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { dayOf } from "@/lib/dates";
import { finishSessionSchema, updateSetSchema } from "@/lib/schemas/lifting";
import {
  archiveTemplateSchema,
  createTemplateSchema,
  updateTemplateSchema,
} from "@/lib/schemas/template";
import { DomainError, NotFoundError } from "@/server/services/errors";
import {
  createExercise,
  deleteSet,
  getE1rmHistory,
  getHistory,
  getMuscleGroupWeeklyVolume,
  getSession,
  listSessions,
  logSet,
  resolveExerciseByName,
  setSessionFinished,
  suggestExercises,
  updateSet,
} from "@/server/services/lifting";
import {
  createTemplate,
  duplicateTemplate,
  listTemplates,
  resolveTemplateByName,
  setArchived as setTemplateArchived,
  startSessionFromTemplate,
  updateTemplate,
} from "@/server/services/templates";

import { fail, ok, run } from "./shared";

// ----- template tool helpers --------------------------------------------------

/** One pre-defined warmup set as the agent supplies it. The canonical
 *  warmupSetInputSchema (a weight_mode-discriminated union) re-validates after
 *  the snake→camel mapping. */
const warmupToolSchema = z.object({
  weight_mode: z
    .enum(["ABSOLUTE", "PERCENT"])
    .describe("ABSOLUTE: a fixed weight_kg; PERCENT: percent_of_working."),
  reps: z.number().int().describe("Warmup repetitions (1–100)."),
  weight_kg: z
    .number()
    .optional()
    .describe("ABSOLUTE mode: the fixed weight in kg (required then)."),
  percent_of_working: z
    .number()
    .optional()
    .describe("PERCENT mode: 1–100% of the working weight (required then)."),
});

/** One template exercise as the agent supplies it — by exercise NAME, with the
 *  canonical target fields (templateExerciseInputSchema re-validates the
 *  REPS/VOLUME discrimination after mapping). Shared by create/update. */
const templateExerciseToolSchema = z.object({
  exercise: z
    .string()
    .min(1)
    .describe(
      "Exercise name (must already exist in the catalog; case-insensitive — " +
        "never auto-created).",
    ),
  target_type: z
    .enum(["REPS", "VOLUME"])
    .describe(
      "REPS: N sets in a rep range. VOLUME: a single Σ reps×weight goal.",
    ),
  target_sets: z
    .number()
    .int()
    .optional()
    .describe("REPS mode: working sets, 1–20 (required for REPS)."),
  rep_min: z
    .number()
    .int()
    .optional()
    .describe("REPS mode: bottom of the rep range, 1–100 (required for REPS)."),
  rep_max: z
    .number()
    .int()
    .optional()
    .describe("REPS mode: top of the rep range, 1–100 (required for REPS)."),
  target_weight_kg: z
    .number()
    .optional()
    .describe("REPS mode: optional working weight in kg."),
  weight_increment_kg: z
    .number()
    .optional()
    .describe("REPS mode: optional progression increment in kg."),
  target_volume_kg: z
    .number()
    .optional()
    .describe(
      "VOLUME mode: the Σ reps×weight goal in kg (required for VOLUME).",
    ),
  rest_sec: z
    .number()
    .int()
    .optional()
    .describe("Rest between sets in seconds (0–3600)."),
  notes: z.string().optional().describe("Per-exercise notes."),
  warmups: z
    .array(warmupToolSchema)
    .optional()
    .describe("Ordered warmup definitions, rendered before the working sets."),
});
type TemplateExerciseToolInput = z.infer<typeof templateExerciseToolSchema>;

/** Map tool-level exercises (names, snake_case) to canonical-schema-shaped rows
 *  (ids, camelCase) WITHOUT writing. An unknown exercise name aborts the whole
 *  save so a template is never half-resolved. */
async function resolveTemplateExercises(
  exercises: TemplateExerciseToolInput[],
): Promise<
  { exercises: unknown[] } | { unknownExercise: string; error: NotFoundError }
> {
  const out: unknown[] = [];
  for (const e of exercises) {
    let exerciseId: string;
    try {
      exerciseId = (await resolveExerciseByName(e.exercise)).id;
    } catch (err) {
      if (err instanceof NotFoundError) {
        return { unknownExercise: e.exercise, error: err };
      }
      throw err;
    }
    out.push({
      exerciseId,
      targetType: e.target_type,
      targetSets: e.target_sets,
      repMin: e.rep_min,
      repMax: e.rep_max,
      targetWeightKg: e.target_weight_kg,
      weightIncrementKg: e.weight_increment_kg,
      targetVolumeKg: e.target_volume_kg,
      restSec: e.rest_sec,
      notes: e.notes,
      warmups: (e.warmups ?? []).map((w) => ({
        weightMode: w.weight_mode,
        reps: w.reps,
        weightKg: w.weight_kg,
        percentOfWorking: w.percent_of_working,
      })),
    });
  }
  return { exercises: out };
}

/** Shared body of create/update_workout_template: resolve exercise names to
 *  catalog ids — an unknown name fails with nearestMatches, the same UX as
 *  log_lifting_set, and nothing is written — then run the save through the
 *  standard error translation. */
async function runTemplateSave(
  exercises: TemplateExerciseToolInput[],
  save: (resolved: unknown[]) => Promise<unknown>,
): Promise<CallToolResult> {
  try {
    const resolved = await resolveTemplateExercises(exercises);
    if ("unknownExercise" in resolved) {
      const matches = await suggestExercises(resolved.unknownExercise);
      return fail(resolved.error.message, {
        nearestMatches: matches.map((m) => m.name),
      });
    }
    return await run(() => save(resolved.exercises));
  } catch (err) {
    console.error(err);
    return fail("internal error");
  }
}

/** The target template id from an id-XOR-name selector. Name resolution
 *  (resolveTemplateByName) errors on unknown names, listing the active
 *  templates, and REFUSES archived matches — so archived templates are id-only
 *  (ids from list_workout_templates with include_archived: true). */
async function resolveTemplateId(
  id: string | undefined,
  template: string | undefined,
): Promise<string> {
  if (id != null && template == null) return id;
  if (id == null && template != null) {
    return (await resolveTemplateByName(template)).id;
  }
  throw new DomainError("provide exactly one of id or template");
}

export function registerLiftingTools(server: McpServer): void {
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
    "get_exercise_strength",
    {
      description:
        "Strength progression for one exercise: the best estimated 1-rep-max (e1RM) " +
        "per day over a rolling window, newest data last. e1RM (Epley) puts heavy-low-rep " +
        "and lighter-high-rep working sets on ONE comparable scale; warmups are excluded. " +
        "Each point flags isPr=true when it set an all-time e1RM high. e1RM is an ESTIMATE " +
        "(a trend), not a tested max. Errors if the exercise name is unknown.",
      inputSchema: {
        exercise: z
          .string()
          .min(1)
          .describe("Exercise name (case-insensitive exact match)."),
        days: z
          .number()
          .int()
          .min(1)
          .max(365)
          .default(90)
          .describe("Rolling window in days (default 90)."),
      },
    },
    ({ exercise, days }) => run(() => getE1rmHistory(exercise, days)),
  );

  server.registerTool(
    "get_muscle_group_volume",
    {
      description:
        "Weekly hard sets per muscle group (working sets only, warmups excluded), " +
        "bucketed by ISO week over a rolling window — the key training-volume metric " +
        "for balance and hypertrophy. Grouped by each exercise's muscle-group tag; " +
        "untagged exercises fall under 'Other'. Returns { groups, weeks } where each " +
        "week row has a set count per group.",
      inputSchema: {
        weeks: z
          .number()
          .int()
          .min(1)
          .max(52)
          .default(12)
          .describe("Rolling window in weeks (default 12)."),
      },
    },
    ({ weeks }) => run(() => getMuscleGroupWeeklyVolume(weeks)),
  );

  server.registerTool(
    "create_exercise",
    {
      description:
        "Add a new exercise to the catalog so it can be logged or put in a " +
        "workout template. The name must be unique (case-insensitive) — check " +
        "get_lifting_history / list_workout_templates first to avoid near-" +
        "duplicates. Returns the created exercise. (log_set never auto-creates " +
        "exercises; this is the deliberate way to add one.)",
      inputSchema: {
        name: z
          .string()
          .min(1)
          .describe("Exercise name, e.g. 'Incline Dumbbell Press'."),
        muscle_group: z
          .string()
          .min(1)
          .optional()
          .describe("Optional muscle-group tag, e.g. 'chest'."),
      },
    },
    ({ name, muscle_group }) =>
      run(() => createExercise({ name, muscleGroup: muscle_group })),
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
    "update_lifting_set",
    {
      description:
        "Correct one already-logged set IN PLACE — get set ids from " +
        "get_session_progress (or get_lifting_history). Only the provided fields " +
        "change; the set's session, exercise and set number are immutable. " +
        "rpe: null clears a mistakenly-entered RPE. Provide at least one field " +
        "besides id. Returns the updated set.",
      inputSchema: {
        id: z.cuid().describe("The set id to edit."),
        // The canonical update-set schema's fields (shared with the PATCH route).
        reps: updateSetSchema.shape.reps.describe("Repetitions (1–100)."),
        weight_kg: updateSetSchema.shape.weightKg.describe(
          "Weight in kilograms (0–500).",
        ),
        rpe: updateSetSchema.shape.rpe.describe(
          "Rate of perceived exertion (1–10); null clears it.",
        ),
        is_warmup: updateSetSchema.shape.isWarmup.describe(
          "Reclassify as warmup (true) or working set (false) — moves it in/out " +
            "of volume and e1RM math.",
        ),
      },
    },
    ({ id, reps, weight_kg, rpe, is_warmup }) =>
      run(() =>
        updateSet(id, {
          reps,
          weightKg: weight_kg,
          rpe,
          isWarmup: is_warmup,
        }),
      ),
  );

  server.registerTool(
    "delete_lifting_set",
    {
      description:
        "Delete ONE mistaken set by id — get ids from get_session_progress. Set " +
        "numbers are display-order only, so the gap this leaves is harmless. " +
        "Single-set correction only; deleting a whole session (a bulk delete) is " +
        "deliberately not available over MCP. Not undoable — re-log with " +
        "log_lifting_set if deleted in error.",
      inputSchema: {
        id: z.cuid().describe("The set id to delete."),
      },
    },
    ({ id }) =>
      run(async () => {
        await deleteSet(id);
        return { deleted: true, id };
      }),
  );

  server.registerTool(
    "finish_workout_session",
    {
      description:
        "Mark a lifting session finished (stamps its end time) — or reopen a " +
        "mistakenly-finished one with finished: false. Without a session_id, " +
        "targets today's most recent session (the same fallback " +
        "get_session_progress uses); errors if there is none today. Idempotent — " +
        "re-finishing just refreshes the timestamp, reopening an open session is " +
        "a no-op. Returns the session's full detail (get_session_progress shape).",
      inputSchema: {
        session_id: z
          .cuid()
          .optional()
          .describe("Session id; omit for the most recent session today."),
        finished: finishSessionSchema.shape.finished.describe(
          "true (default) finishes the session; false reopens it.",
        ),
      },
    },
    ({ session_id, finished }) =>
      run(async () => {
        if (session_id) return setSessionFinished(session_id, finished);
        const [latest] = await listSessions(dayOf(new Date()));
        if (!latest) throw new DomainError("no lifting session today");
        return setSessionFinished(latest.sessionId, finished);
      }),
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
        const match = await resolveTemplateByName(template);
        return startSessionFromTemplate({ templateId: match.id });
      }),
  );

  server.registerTool(
    "create_workout_template",
    {
      description:
        "Create a workout template — a reusable session plan of ordered " +
        "exercises, each with a target: REPS (target_sets sets of rep_min–" +
        "rep_max, optional target_weight_kg and weight_increment_kg for " +
        "progression suggestions) or VOLUME (target_volume_kg, a Σ reps×weight " +
        "goal). Optional per-exercise rest_sec, notes and ordered warmups " +
        "(ABSOLUTE weight_kg or PERCENT percent_of_working). Exercises are " +
        "referenced by NAME and must already exist — an unknown name errors " +
        "with nearestMatches and creates NOTHING (add one first with " +
        "create_exercise). Template names are unique. Creates the plan only — " +
        "start_workout_from_template begins a session from it.",
      inputSchema: {
        name: z.string().min(1).describe("Template name (must be unique)."),
        notes: z.string().optional().describe("Optional notes."),
        exercises: z
          .array(templateExerciseToolSchema)
          .min(1)
          .describe("The plan's exercises, in order."),
      },
    },
    ({ name, notes, exercises }) =>
      runTemplateSave(exercises, (resolved) =>
        createTemplate(
          createTemplateSchema.parse({ name, notes, exercises: resolved }),
        ),
      ),
  );

  server.registerTool(
    "update_workout_template",
    {
      description:
        "FULL REPLACE of a workout template — read the current definition first " +
        "(list_workout_templates), then send the COMPLETE new name, notes and " +
        "exercise list (anything omitted is gone). Target exactly one of id / " +
        "template; name resolution refuses archived templates, so edit those by " +
        "id (from list_workout_templates with include_archived: true). Template " +
        "edits NEVER rewrite past or in-progress sessions — every session " +
        "carries its own plan snapshot from start time; the new plan applies " +
        "from the next start_workout_from_template. Unknown exercise names " +
        "error with nearestMatches and change NOTHING.",
      inputSchema: {
        id: z
          .cuid()
          .optional()
          .describe("Template id (exactly one of id / template)."),
        template: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Template name (case-insensitive; active templates only).",
          ),
        name: z
          .string()
          .min(1)
          .describe("The template's name — send even if unchanged (full replace)."),
        notes: z
          .string()
          .optional()
          .describe("Notes; omitting clears them (full replace)."),
        exercises: z
          .array(templateExerciseToolSchema)
          .min(1)
          .describe("The COMPLETE new exercise list, in order."),
      },
    },
    ({ id, template, name, notes, exercises }) =>
      runTemplateSave(exercises, async (resolved) =>
        updateTemplate(
          await resolveTemplateId(id, template),
          updateTemplateSchema.parse({ name, notes, exercises: resolved }),
        ),
      ),
  );

  server.registerTool(
    "duplicate_workout_template",
    {
      description:
        'Duplicate a workout template as "<name> (copy)" — the safe way to ' +
        "iterate on a plan without touching the original (then reshape the copy " +
        "with update_workout_template). Copies exercises, targets, warmups and " +
        "notes; the copy starts unarchived and has no session history. Target " +
        "exactly one of id / template (name resolution refuses archived " +
        "templates — duplicate those by id).",
      inputSchema: {
        id: z
          .cuid()
          .optional()
          .describe("Template id (exactly one of id / template)."),
        template: z
          .string()
          .min(1)
          .optional()
          .describe("Template name (case-insensitive; active templates only)."),
      },
    },
    ({ id, template }) =>
      run(async () => duplicateTemplate(await resolveTemplateId(id, template))),
  );

  server.registerTool(
    "archive_workout_template",
    {
      description:
        "Archive a workout template (hidden from list_workout_templates and " +
        "refused by start_workout_from_template — never deletes; past sessions " +
        "keep their plan snapshots and any rotation slot referencing it is " +
        "flagged, not removed), or restore it with archived: false. Target " +
        "exactly one of id / template. Restoring is id-ONLY: name resolution " +
        "refuses archived templates, so get the id from list_workout_templates " +
        "with include_archived: true.",
      inputSchema: {
        id: z
          .cuid()
          .optional()
          .describe("Template id (exactly one of id / template)."),
        template: z
          .string()
          .min(1)
          .optional()
          .describe("Template name (case-insensitive; active templates only)."),
        // The route's archive schema has no default; the MCP edge defaults to
        // archiving so a bare call retires the template.
        archived: archiveTemplateSchema.shape.archived
          .default(true)
          .describe("true (default) archives; false restores (requires id)."),
      },
    },
    ({ id, template, archived }) =>
      run(async () =>
        setTemplateArchived(await resolveTemplateId(id, template), archived),
      ),
  );
}
