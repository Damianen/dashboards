"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getJSON, patchJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import type { TdeeWindow } from "@/lib/schemas/insights";
// Type-only import: erased at build time, so no server code is bundled.
import type { TdeeEstimateResult } from "@/server/services/tdee";

export type { TdeeEstimateResult, TdeeWindow };

/**
 * The empirical TDEE estimate. A null `window` fetches the server's stored default
 * (the response echoes the resolved window); a concrete window overrides it. `enabled`
 * gates the request so the card can stay idle until it scrolls into view.
 */
export function useTdee(window: TdeeWindow | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.tdee(window ?? 0),
    queryFn: () =>
      getJSON<TdeeEstimateResult>(
        `/api/insights/tdee${window ? `?window=${window}` : ""}`,
      ),
    enabled,
  });
}

/** Persist the chosen window as the new default (best-effort; toasts on failure). */
export function useSetTdeeWindow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (windowDays: TdeeWindow) =>
      patchJSON<{ windowDays: TdeeWindow }>("/api/insights/tdee", { windowDays }),
    onError: () => toast.error("Couldn't save the window"),
    // tdee(0) is the "server default" query — a new default must refetch it too.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.tdeePrefix() });
    },
  });
}
