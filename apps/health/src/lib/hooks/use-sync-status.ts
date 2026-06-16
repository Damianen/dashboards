"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
// Type-only import: erased at build time, so no server code is bundled.
import type { SyncStatusEntry } from "@/server/services/sync";

export type { SyncStatusEntry };

/**
 * Per-source sync status for the Settings card. Refetches every 30 s so the badges stay
 * fresh while the page is open; with refetchIntervalInBackground left at its default
 * (false), polling pauses when the tab isn't visible.
 */
export function useSyncStatus() {
  return useQuery({
    queryKey: queryKeys.syncStatus(),
    queryFn: () => getJSON<SyncStatusEntry[]>("/api/sync/status"),
    refetchInterval: 30_000,
  });
}
