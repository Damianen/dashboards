// AST + the runtime types the evaluator works over. Kept free of any Prisma or
// server import so the whole module is pure and browser-safe.

export type FilterNode =
  | { kind: "or"; left: FilterNode; right: FilterNode }
  | { kind: "and"; left: FilterNode; right: FilterNode }
  | { kind: "not"; operand: FilterNode }
  | TermNode;

export type TermNode =
  | { kind: "today" }
  | { kind: "tomorrow" }
  | { kind: "overdue" }
  | { kind: "noDate" }
  | { kind: "noLabel" }
  | { kind: "priority"; level: 1 | 2 | 3 | 4 }
  | { kind: "project"; name: string }
  | { kind: "label"; name: string }
  | { kind: "section"; name: string }
  | { kind: "search"; text: string }
  // `date before:` / `date after:` keep the RAW chrono phrase; it is resolved at
  // compile time (chrono needs `now` + timezone, which only the context carries).
  // `position` is the column of the term so a bad phrase can still point home.
  | { kind: "dateBefore"; expr: string; position: number }
  | { kind: "dateAfter"; expr: string; position: number }
  | { kind: "nextNDays"; days: number };

/**
 * The minimal, Prisma-free view of a task the compiled predicate reads. The
 * service maps each DB row to this before filtering.
 */
export interface FilterTask {
  title: string;
  description: string | null;
  priority: number;
  dueAt: Date | null;
  hasDueTime: boolean;
  timezone: string;
  /** Label names (any case). */
  labels: string[];
  projectName: string;
  sectionName: string | null;
}

/**
 * Evaluation context. A single global `timeZone` is used for every window/date
 * term (today/tomorrow/overdue/next N days/date before/after), matching the
 * date views (listToday/listOverdue/listUpcoming); a task's own `timezone` is
 * not used for windowing.
 */
export interface FilterContext {
  now: Date;
  timeZone: string;
}
