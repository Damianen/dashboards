// Input shapes for the MCP tools. These are Zod *raw shapes* (plain objects of
// Zod types) because that is what the MCP SDK's registerTool expects. They are
// the agent-facing surface — names instead of ids, `due_iso` instead of a
// Date/hasDueTime pair — and the tool adapters translate them before handing
// off to the service-layer schemas (taskCreateSchema etc.), which stay the
// real validation chokepoint.

import { z } from "zod";

import { isValidDueIso } from "@/lib/dates";

import { idSchema, prioritySchema } from "./common";

const contentSchema = z.string().trim().min(1).max(500);
const descriptionSchema = z.string().max(10_000);
const nameSchema = z.string().trim().min(1);
const labelNamesSchema = z.array(z.string().trim().min(1).max(60)).max(50);
const dueIsoSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    isValidDueIso,
    "due_iso must be ISO 8601: a date (2026-06-20) or datetime (2026-06-20T14:30)",
  );

export const createTaskShape = {
  content: contentSchema
    .optional()
    .describe(
      "What needs doing — the task title. Required unless you pass `text` instead.",
    ),
  text: contentSchema
    .optional()
    .describe(
      "Natural-language quick capture, e.g. \"pay rent tomorrow 9am p2 #Finance @admin\". " +
        "Parses the title, due date/time, priority (p1–p4), #project, /section and @label out of one line; " +
        "an unknown project, section, or label is CREATED automatically. A leading \"every …\" recurrence is " +
        "noted but not yet scheduled. Mutually exclusive with the structured fields below — pass `text` alone.",
    ),
  description: descriptionSchema
    .optional()
    .describe("Optional longer note / details."),
  project_name: nameSchema
    .optional()
    .describe(
      "Project to file the task under (case-insensitive). Omit for the Inbox. An unknown name errors — call create_project first.",
    ),
  section_name: nameSchema
    .optional()
    .describe(
      "Section within the project; must already exist. Requires project_name.",
    ),
  label_names: labelNamesSchema
    .optional()
    .describe("Labels to attach (case-insensitive); any that don't exist are created."),
  priority: prioritySchema
    .optional()
    .describe("1 = highest (p1) … 4 = default (p4)."),
  due_iso: dueIsoSchema
    .optional()
    .describe(
      "Due date. 'YYYY-MM-DD' = all-day; a full datetime = timed. A datetime without a timezone offset is read in Europe/Amsterdam.",
    ),
};

export const listTasksShape = {
  project_name: nameSchema
    .optional()
    .describe("List a project's tasks (case-insensitive). Mutually exclusive with view."),
  view: z
    .enum(["today", "upcoming", "overdue"])
    .optional()
    .describe(
      "A cross-project view of incomplete tasks: today (due today), upcoming (next 7 days), or overdue. Mutually exclusive with project_name.",
    ),
  include_completed: z
    .boolean()
    .optional()
    .describe("Include completed tasks. Only applies when listing a project."),
};

export const getTaskShape = {
  task_id: idSchema.describe("Id of the task to fetch."),
};

export const updateTaskShape = {
  task_id: idSchema.describe("Id of the task to update."),
  content: contentSchema.optional().describe("New title."),
  description: descriptionSchema
    .nullable()
    .optional()
    .describe("New note; null clears it."),
  priority: prioritySchema
    .optional()
    .describe("1 = highest (p1) … 4 = default (p4)."),
  due_iso: dueIsoSchema
    .nullable()
    .optional()
    .describe("New due date (see create_task); null clears the due date."),
  label_names: labelNamesSchema
    .optional()
    .describe("Replaces the entire label set (case-insensitive; missing labels are created). Pass [] to clear."),
};

export const completeTaskShape = {
  task_id: idSchema.describe("Id of the task to complete."),
};

export const reopenTaskShape = {
  task_id: idSchema.describe("Id of the completed task to reopen."),
};

export const moveTaskShape = {
  task_id: idSchema.describe("Id of the task to move."),
  project_name: nameSchema
    .optional()
    .describe("Destination project (case-insensitive)."),
  section_name: nameSchema
    .optional()
    .describe(
      "Destination section within the target project; must already exist.",
    ),
};

export const listProjectsShape = {
  include_archived: z
    .boolean()
    .optional()
    .describe("Include archived projects."),
};

export const createProjectShape = {
  name: nameSchema.describe("Name for the new project."),
};

export const addCommentShape = {
  task_id: idSchema
    .optional()
    .describe("Comment on this task. Mutually exclusive with project_name."),
  project_name: nameSchema
    .optional()
    .describe(
      "Comment on this project (case-insensitive). Mutually exclusive with task_id.",
    ),
  body: z.string().trim().min(1).max(10_000).describe("Comment text."),
};
