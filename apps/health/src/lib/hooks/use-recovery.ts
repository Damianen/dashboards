"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
// Type-only import: erased at build time, so no server code is bundled.
import type { MetricRecovery, RecoveryResult } from "@/server/services/recovery";

export type { MetricRecovery, RecoveryResult };

/** The day's recovery read: RHR / HRV / temp-deviation vs a rolling baseline + overall status. */
export function useRecovery(day: string, window = 30) {
  return useQuery({
    queryKey: queryKeys.recovery(day, window),
    queryFn: () =>
      getJSON<RecoveryResult>(
        `/api/insights/recovery?day=${encodeURIComponent(day)}&window=${window}`,
      ),
  });
}
