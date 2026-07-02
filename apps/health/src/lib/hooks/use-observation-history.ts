"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
// Type-only import: erased at build time, so no server code is bundled.
import type { NotifiedObservationView } from "@/server/services/observations";

export type { NotifiedObservationView };

/** Past push-notified observations, newest first. `enabled` gates the request
 *  so the card stays idle until it scrolls into view (see useInView). */
export function useObservationHistory(limit = 20, enabled = true) {
  return useQuery({
    queryKey: queryKeys.observationHistory(limit),
    queryFn: () =>
      getJSON<NotifiedObservationView[]>(
        `/api/insights/observations/history?limit=${limit}`,
      ),
    enabled,
  });
}
