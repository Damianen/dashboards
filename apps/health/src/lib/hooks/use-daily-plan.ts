"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import type { DailyPlanDetail } from "@/server/services/dailyPlans";

/** A single plan with its items, for the builder's edit mode. Idle until `id` is set. */
export function useDailyPlan(id: string | null) {
  return useQuery({
    queryKey: queryKeys.dailyPlan(id ?? "none"),
    queryFn: () => getJSON<DailyPlanDetail>(`/api/food/daily-plans/${id}`),
    enabled: id != null,
  });
}
