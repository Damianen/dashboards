"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
// Type-only import: erased at build time, so no server code is bundled.
import type { MuscleGroupVolume } from "@/server/services/lifting";

export type { MuscleGroupVolume };

/**
 * Weekly hard-sets-per-muscle-group volume over the last `weeks` weeks. `enabled`
 * gates the request so the card stays idle until it scrolls into view.
 */
export function useMuscleVolume(weeks: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.muscleVolume(weeks),
    queryFn: () =>
      getJSON<MuscleGroupVolume>(`/api/lifting/muscle-volume?weeks=${weeks}`),
    enabled,
  });
}
