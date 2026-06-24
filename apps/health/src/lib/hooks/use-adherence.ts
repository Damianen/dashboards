"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
// Type-only import: erased at build time, so no server code is bundled.
import type { AdherenceResult } from "@/server/services/adherence";

export type { AdherenceResult };

/** The day's protein adherence + logging/supplement streaks. */
export function useAdherence(day: string) {
  return useQuery({
    queryKey: queryKeys.adherence(day),
    queryFn: () =>
      getJSON<AdherenceResult>(
        `/api/insights/adherence?day=${encodeURIComponent(day)}`,
      ),
  });
}
