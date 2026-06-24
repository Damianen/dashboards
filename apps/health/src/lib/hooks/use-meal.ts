"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import type { MealDetail } from "@/server/services/meals";

/** A single meal with its items, for the builder's edit mode. Idle until `id` is set. */
export function useMeal(id: string | null) {
  return useQuery({
    queryKey: queryKeys.meal(id ?? "none"),
    queryFn: () => getJSON<MealDetail>(`/api/food/meals/${id}`),
    enabled: id != null,
  });
}
