"use client";

import { postJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import { useArchiveToggle } from "@/lib/hooks/use-archive-toggle";
// Type-only import: erased at build time, so no server code is bundled.
import type { DailyPlanSummary } from "@/server/services/dailyPlans";

/**
 * Archive a plan (hidden from the list; never deleted) or restore it
 * ({ archived: false }): cached lists flip optimistically, then the
 * ["daily-plans"] prefix refresh covers both filters and any open builder
 * detail. `archived` defaults to true so the builder's Archive action stays a
 * one-field mutate.
 */
export function useArchiveDailyPlan() {
  const toggle = useArchiveToggle<DailyPlanSummary>({
    prefix: queryKeys.dailyPlans(),
    request: ({ id, archived }) =>
      postJSON(`/api/food/daily-plans/${id}/archive`, { archived }),
    errorMessage: "Couldn't update the plan",
    successMessage: (archived) => (archived ? "Plan archived" : "Plan restored"),
  });
  return {
    ...toggle,
    mutate: (
      { id, archived = true }: { id: string; archived?: boolean },
      options?: Parameters<typeof toggle.mutate>[1],
    ) => toggle.mutate({ id, archived }, options),
  };
}
