"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import type { DailyPlanSummary } from "@/server/services/dailyPlans";

/** Saved daily plans, alphabetical; excludes archived unless asked. */
export function useDailyPlans(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.dailyPlanList(includeArchived),
    queryFn: () =>
      getJSON<DailyPlanSummary[]>(
        `/api/food/daily-plans${includeArchived ? "?includeArchived=true" : ""}`,
      ),
  });
}
