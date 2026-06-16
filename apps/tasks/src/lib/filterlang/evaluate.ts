// Evaluator: compile an AST into an in-memory predicate over FilterTask. Window
// and date boundaries are resolved ONCE at compile (they don't vary per task),
// so per-task evaluation is cheap. All date math reuses src/lib/dates.ts and a
// single global ctx.timeZone, matching the date views.

import * as chrono from "chrono-node";

import {
  addDaysToDayStart,
  isOverdue,
  todayWindow,
  tzOffsetMinutes,
  upcomingWindow,
  wallTimeToInstant,
  zonedDayStart,
} from "@/lib/dates";

import type { FilterContext, FilterNode, FilterTask, TermNode } from "./ast";
import { FilterParseError } from "./errors";

type Predicate = (task: FilterTask) => boolean;

export function compile(
  ast: FilterNode,
  ctx: FilterContext,
  input = "",
): Predicate {
  return build(ast, ctx, input);
}

function build(node: FilterNode, ctx: FilterContext, input: string): Predicate {
  switch (node.kind) {
    case "or": {
      const l = build(node.left, ctx, input);
      const r = build(node.right, ctx, input);
      return (t) => l(t) || r(t);
    }
    case "and": {
      const l = build(node.left, ctx, input);
      const r = build(node.right, ctx, input);
      return (t) => l(t) && r(t);
    }
    case "not": {
      const o = build(node.operand, ctx, input);
      return (t) => !o(t);
    }
    default:
      return buildTerm(node, ctx, input);
  }
}

/** True when `dueAt` falls in the half-open window [start, end). */
function inWindow(start: Date, end: Date): Predicate {
  const s = start.getTime();
  const e = end.getTime();
  return (t) =>
    t.dueAt !== null && t.dueAt.getTime() >= s && t.dueAt.getTime() < e;
}

function buildTerm(node: TermNode, ctx: FilterContext, input: string): Predicate {
  const { now, timeZone } = ctx;
  switch (node.kind) {
    case "today": {
      const { start, end } = todayWindow(timeZone, now);
      return inWindow(start, end);
    }
    case "tomorrow": {
      const { start, end } = upcomingWindow(1, timeZone, now);
      return inWindow(start, end);
    }
    case "overdue":
      return (t) => isOverdue(t.dueAt, t.hasDueTime, timeZone, now);
    case "noDate":
      return (t) => t.dueAt === null;
    case "noLabel":
      return (t) => t.labels.length === 0;
    case "priority":
      return (t) => t.priority === node.level;
    case "project": {
      const name = node.name.toLowerCase();
      return (t) => t.projectName.toLowerCase() === name;
    }
    case "label": {
      const name = node.name.toLowerCase();
      return (t) => t.labels.some((l) => l.toLowerCase() === name);
    }
    case "section": {
      const name = node.name.toLowerCase();
      return (t) =>
        t.sectionName !== null && t.sectionName.toLowerCase() === name;
    }
    case "search": {
      const needle = node.text.toLowerCase();
      return (t) =>
        `${t.title} ${t.description ?? ""}`.toLowerCase().includes(needle);
    }
    case "dateBefore": {
      const boundary = resolveDay(node.expr, node.position, ctx, input).getTime();
      return (t) =>
        t.dueAt !== null &&
        zonedDayStart(t.dueAt, timeZone).getTime() < boundary;
    }
    case "dateAfter": {
      const boundary = resolveDay(node.expr, node.position, ctx, input).getTime();
      return (t) =>
        t.dueAt !== null &&
        zonedDayStart(t.dueAt, timeZone).getTime() > boundary;
    }
    case "nextNDays": {
      const start = zonedDayStart(now, timeZone);
      const end = addDaysToDayStart(start, node.days, timeZone);
      return inWindow(start, end);
    }
  }
}

/**
 * Resolve a `date before/after:` phrase to local midnight of its day, reading
 * chrono's wall-clock components (like quickadd/parse.ts) so it is DST- and
 * host-timezone-safe. An unparseable phrase is a FilterParseError pointing at
 * the term.
 */
function resolveDay(
  expr: string,
  position: number,
  ctx: FilterContext,
  input: string,
): Date {
  const ref: chrono.ParsingReference = {
    instant: ctx.now,
    timezone: tzOffsetMinutes(ctx.now, ctx.timeZone),
  };
  const option: chrono.ParsingOption = { forwardDate: true };
  const candidates: chrono.ParsedResult[] = [
    ...chrono.parse(expr, ref, option),
    ...chrono.nl.parse(expr, ref, option),
  ];
  candidates.sort((a, b) => a.index - b.index);
  const result = candidates[0];
  const year = result?.start.get("year");
  const month = result?.start.get("month");
  const day = result?.start.get("day");
  if (
    year === undefined ||
    year === null ||
    month === undefined ||
    month === null ||
    day === undefined ||
    day === null
  )
    throw new FilterParseError(
      `couldn't understand the date "${expr}"`,
      position,
      input,
    );
  return wallTimeToInstant({ year, month, day }, ctx.timeZone);
}
