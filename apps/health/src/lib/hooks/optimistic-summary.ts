import type { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/hooks/keys";
import type { DailySummary } from "@/server/services/summary";

export type { DailySummary };

export type SummaryPatch = (s: DailySummary) => DailySummary;

/**
 * Optimistically patch the cached daily summary for a day and return the prior
 * value for rollback. We only patch when a non-null summary is already cached —
 * the server view owns the canonical shape (and the water-target formula), so we
 * never synthesise a summary from nothing.
 */
export async function applyOptimisticSummary(
  qc: QueryClient,
  day: string,
  patch: SummaryPatch,
): Promise<DailySummary | null | undefined> {
  const key = queryKeys.summary(day);
  await qc.cancelQueries({ queryKey: key });
  const previous = qc.getQueryData<DailySummary | null>(key);
  if (previous) qc.setQueryData<DailySummary | null>(key, patch(previous));
  return previous;
}

export function rollbackSummary(
  qc: QueryClient,
  day: string,
  previous: DailySummary | null | undefined,
): void {
  if (previous !== undefined) {
    qc.setQueryData(queryKeys.summary(day), previous);
  }
}

/** Refetch everything that depends on a day's logs. */
export async function invalidateDay(
  qc: QueryClient,
  day: string,
): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.summary(day) }),
    qc.invalidateQueries({ queryKey: queryKeys.water(day) }),
  ]);
}
