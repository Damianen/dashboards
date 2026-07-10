"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON, postJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
// Type-only imports: erased at build time, so no server code is bundled.
import type {
  ActiveGoalView,
  CheckInDTO,
  GoalDTO,
  GoalPlan,
  GoalStatusResult,
} from "@/server/services/goals";

export type { ActiveGoalView, CheckInDTO, GoalDTO, GoalPlan, GoalStatusResult };

/** The Goal screen's one read: active goal + last goal + check-in history. */
export function useGoalStatus() {
  return useQuery({
    queryKey: queryKeys.goalStatus(),
    queryFn: () => getJSON<GoalStatusResult>("/api/goals"),
  });
}

/**
 * Live plan preview for the create form (POST /api/goals/preview — persists
 * nothing). The caller debounces the inputs and enables only once they parse.
 * Domain errors (low TDEE confidence, date too near) are terminal for these
 * inputs, so no retries — they surface via `error` for inline display.
 */
export function useGoalPreview(
  input: { goalWeightKg: string; targetDate: string },
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.goalPreview(input.goalWeightKg, input.targetDate),
    queryFn: () =>
      postJSON<GoalPlan>("/api/goals/preview", {
        goalWeightKg: input.goalWeightKg,
        targetDate: input.targetDate,
      }),
    enabled,
    retry: false,
  });
}
