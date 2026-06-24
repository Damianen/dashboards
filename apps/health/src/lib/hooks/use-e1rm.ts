"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
// Type-only import: erased at build time, so no server code is bundled.
import type { E1rmPoint } from "@/server/services/lifting";

export type { E1rmPoint };

/**
 * Per-day best estimated 1RM for one exercise over the last `days` days. `enabled`
 * gates the request so the card stays idle until it has both a picked exercise and
 * has scrolled into view. Disabled when no exercise is selected.
 */
export function useE1rm(exercise: string | null, days: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.e1rm(exercise ?? "", days),
    queryFn: () =>
      getJSON<E1rmPoint[]>(
        `/api/lifting/e1rm?exercise=${encodeURIComponent(exercise ?? "")}&days=${days}`,
      ),
    enabled: enabled && !!exercise,
  });
}
