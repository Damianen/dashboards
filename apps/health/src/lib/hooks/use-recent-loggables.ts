"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import type { RecentLoggableDTO } from "@/lib/food";
import { queryKeys } from "@/lib/hooks/keys";

/** Recently-logged distinct foods, newest first — the 2-tap re-log strip. */
export function useRecentLoggables(limit = 8) {
  return useQuery({
    queryKey: queryKeys.foodRecent(limit),
    queryFn: () =>
      getJSON<RecentLoggableDTO[]>(`/api/food/entries/recent?limit=${limit}`),
  });
}
