"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import type { MealSummary } from "@/server/services/meals";

/** Saved meals (recipes), alphabetical; excludes archived unless asked. */
export function useMeals(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.mealList(includeArchived),
    queryFn: () =>
      getJSON<MealSummary[]>(
        `/api/food/meals${includeArchived ? "?includeArchived=true" : ""}`,
      ),
  });
}
