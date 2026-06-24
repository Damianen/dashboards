"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
// Type-only import: erased at build time, so no server code is bundled.
import type { WeightGoalResult } from "@/server/services/weight-goal";

export type { WeightGoalResult };

/**
 * Body-weight goal status (goal, current weight, trend, projected ETA). `enabled`
 * gates the request so the Trends weight card can stay idle until it scrolls in.
 */
export function useWeightGoal(enabled = true) {
  return useQuery({
    queryKey: queryKeys.weightGoal(),
    queryFn: () => getJSON<WeightGoalResult>("/api/insights/weight-goal"),
    enabled,
  });
}
