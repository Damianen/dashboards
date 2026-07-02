"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import type { CustomFoodDTO } from "@/lib/food";
import { queryKeys } from "@/lib/hooks/keys";

/**
 * Saved custom foods for the "My Foods" picker, recently-used first. `q` filters
 * name/brand (case-insensitive); archived foods are excluded unless `includeArchived`.
 */
export function useCustomFoods(q: string, includeArchived = false) {
  const query = q.trim();
  return useQuery({
    queryKey: queryKeys.customFoodList(query, includeArchived),
    queryFn: () => {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (includeArchived) params.set("includeArchived", "true");
      const qs = params.toString();
      return getJSON<CustomFoodDTO[]>(`/api/food/custom${qs ? `?${qs}` : ""}`);
    },
  });
}
