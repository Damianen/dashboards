"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import type { TrendMetric } from "@/lib/schemas/summary";
// Type-only import: erased at build time, so no server code is bundled.
import type { TrendPoint } from "@/server/services/summary";

export type { TrendMetric, TrendPoint };

/**
 * A single metric's daily series over the last `days` days. `enabled` gates the
 * request so a card can stay idle until it scrolls into view (see useInView) —
 * "fetched lazily per visible card".
 */
export function useTrend(metric: TrendMetric, days: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.trends(metric, days),
    queryFn: () =>
      getJSON<TrendPoint[]>(`/api/summary/trends?metric=${metric}&days=${days}`),
    enabled,
  });
}
