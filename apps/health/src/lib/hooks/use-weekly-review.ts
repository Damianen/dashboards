"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
// Type-only import: erased at build time, so no server code is bundled.
import type { WeeklyReviewResult } from "@/server/services/weekly-review";

export type { WeeklyReviewResult };

/**
 * The Monday-start weekly review (this week vs last). `weekStart` may be any
 * civil day inside the wanted week (the server normalizes to its Monday);
 * omit it for the current (partial) week.
 */
export function useWeeklyReview(weekStart?: string) {
  return useQuery({
    queryKey: queryKeys.weeklyReview(weekStart),
    queryFn: () =>
      getJSON<WeeklyReviewResult>(
        weekStart === undefined
          ? "/api/insights/weekly-review"
          : `/api/insights/weekly-review?weekStart=${encodeURIComponent(weekStart)}`,
      ),
  });
}
