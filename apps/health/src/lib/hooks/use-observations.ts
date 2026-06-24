"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
// Type-only import: erased at build time, so no server code is bundled.
import type { ObservationsResult } from "@/server/services/observations";

export type { ObservationsResult };

/**
 * Cross-domain observations for a rolling window (default 30 days). `enabled` gates the
 * request so the card can stay idle until it scrolls into view (see useInView).
 */
export function useObservations(window = 30, enabled = true) {
  return useQuery({
    queryKey: queryKeys.observations(window),
    queryFn: () =>
      getJSON<ObservationsResult>(`/api/insights/observations?window=${window}`),
    enabled,
  });
}
