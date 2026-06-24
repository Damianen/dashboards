"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
// Type-only import: erased at build time, so no server code is bundled.
import type { WorkoutTrends } from "@/server/services/workouts";

export type { WorkoutTrends };

/**
 * Recent Apple Watch workouts + a daily-minutes series over the last `days` days.
 * `enabled` gates the request so the card stays idle until it scrolls into view.
 */
export function useWorkouts(days: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.workouts(days),
    queryFn: () => getJSON<WorkoutTrends>(`/api/workouts?days=${days}`),
    enabled,
  });
}
