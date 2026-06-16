// Grouping for the Upcoming view: bucket tasks by their local due day.

import { localDayKey, zonedDayStart } from "./dates";

export interface DueDayGroup<T> {
  /** "YYYY-MM-DD" local day key. */
  dayKey: string;
  /** UTC instant of the group's local midnight, for headings. */
  dayStart: Date;
  tasks: T[];
}

/**
 * Group tasks by the local calendar day of `dueAt` in `timeZone`. Input order
 * is preserved within groups, and groups appear in input order — callers pass
 * lists already sorted by dueAt. Tasks without a due date are skipped.
 */
export function groupByDueDay<T extends { dueAt: Date | null }>(
  tasks: readonly T[],
  timeZone: string,
): DueDayGroup<T>[] {
  const groups = new Map<string, DueDayGroup<T>>();
  for (const task of tasks) {
    if (task.dueAt === null) continue;
    const dayKey = localDayKey(task.dueAt, timeZone);
    const existing = groups.get(dayKey);
    if (existing) {
      existing.tasks.push(task);
    } else {
      groups.set(dayKey, {
        dayKey,
        dayStart: zonedDayStart(task.dueAt, timeZone),
        tasks: [task],
      });
    }
  }
  return [...groups.values()];
}
