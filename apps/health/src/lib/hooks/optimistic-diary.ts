// The optimistic-diary core shared by the food/meal log mutations (and the
// entry delete's rollback/settle): cancel + snapshot ["food", day], prepend an
// optimistic row, bump the cached summary, roll both back on error, and refetch
// the day's dependent reads on settle. Each hook keeps only its DTO field
// differences and toasts.

import type { QueryClient } from "@tanstack/react-query";

import { todayLocal } from "@/lib/dates";
import type { FoodEntryDTO, MacroTotals } from "@/lib/food";
import { queryKeys } from "@/lib/hooks/keys";
import {
  applyOptimisticSummary,
  type DailySummary,
  rollbackSummary,
} from "@/lib/hooks/optimistic-summary";

export type DiaryCtx = {
  prevEntries: FoodEntryDTO[] | undefined;
  prevSummary: DailySummary | null | undefined;
};

/** Logging while viewing a past day pins the entry to that day (UTC noon always
 *  lands inside the same Amsterdam civil day); today logs at "now". */
export function eatenAtForDay(day: string): string | undefined {
  return day === todayLocal() ? undefined : `${day}T12:00:00.000Z`;
}

export function tempId(): string {
  return `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * The shared onMutate body: cancel + snapshot the day's entries, prepend the
 * optimistic row, and bump the cached summary's intake macros. `caffeineMg`
 * bumps only when truthy (an explicit 0 skips it, matching what the log-food
 * hook always did); the water target itself is recomputed server-side on
 * refetch.
 */
export async function prependOptimisticEntry(
  qc: QueryClient,
  day: string,
  entry: FoodEntryDTO,
  macros: MacroTotals,
  caffeineMg?: number,
): Promise<DiaryCtx> {
  const foodKey = queryKeys.food(day);
  await qc.cancelQueries({ queryKey: foodKey });
  const prevEntries = qc.getQueryData<FoodEntryDTO[]>(foodKey);
  qc.setQueryData<FoodEntryDTO[]>(foodKey, (cur) => [entry, ...(cur ?? [])]);

  const prevSummary = await applyOptimisticSummary(qc, day, (s) => ({
    ...s,
    intakeKcal: (s.intakeKcal ?? 0) + macros.kcal,
    proteinG: (s.proteinG ?? 0) + macros.proteinG,
    carbG: (s.carbG ?? 0) + macros.carbG,
    fatG: (s.fatG ?? 0) + macros.fatG,
    ...(caffeineMg ? { caffeineMg: (s.caffeineMg ?? 0) + caffeineMg } : {}),
  }));

  return { prevEntries, prevSummary };
}

/** Restore the snapshotted entries (when one was taken) and the prior summary.
 *  Toasts stay at the call site. */
export function rollbackDiary(
  qc: QueryClient,
  day: string,
  ctx: DiaryCtx | undefined,
): void {
  if (ctx?.prevEntries !== undefined) {
    qc.setQueryData(queryKeys.food(day), ctx.prevEntries);
  }
  rollbackSummary(qc, day, ctx?.prevSummary);
}

/** The settle set for any diary mutation: the day's entries and summary, plus
 *  adherence (intake/protein progress) and water (caffeine moves the target). */
export function invalidateDiaryDay(qc: QueryClient, day: string): void {
  void qc.invalidateQueries({ queryKey: queryKeys.food(day) });
  void qc.invalidateQueries({ queryKey: queryKeys.summary(day) });
  void qc.invalidateQueries({ queryKey: queryKeys.adherence(day) });
  void qc.invalidateQueries({ queryKey: queryKeys.water(day) });
}
