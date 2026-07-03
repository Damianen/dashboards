// Lifting tools: history, strength and volume reads, the exercise catalog,
// templates, session progress, and the set/session write paths. All writes
// are tagged origin "MCP".

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { dayOf } from "@/lib/dates";
import { DomainError, NotFoundError } from "@/server/services/errors";
import {
  createExercise,
  getE1rmHistory,
  getHistory,
  getMuscleGroupWeeklyVolume,
  getSession,
  listSessions,
  logSet,
  suggestExercises,
} from "@/server/services/lifting";
import {
  listTemplates,
  resolveTemplateByName,
  startSessionFromTemplate,
} from "@/server/services/templates";

import { fail, ok, run } from "./shared";

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
}
