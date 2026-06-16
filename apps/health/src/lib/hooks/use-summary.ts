"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
// Type-only import: erased at build time, so no server code is bundled.
import type { DailySummary } from "@/server/services/summary";

export type { DailySummary };

export function useSummary(day: string) {
  return useQuery({
    queryKey: queryKeys.summary(day),
    queryFn: () =>
      getJSON<DailySummary | null>(
        `/api/summary/daily?day=${encodeURIComponent(day)}`,
      ),
  });
}
