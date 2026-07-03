"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { httpErrorMessage, postJSON } from "@/lib/fetcher";
import { invalidateAfterSync, queryKeys } from "@/lib/hooks/keys";

/** The shared shape returned by the per-provider sync routes (Oura, Withings). */
interface SyncResult {
  /** True when the guard found a run already in flight and did nothing. */
  skipped?: boolean;
  status?: "OK" | "ERROR";
  itemsUpserted?: number;
  needsReauth?: boolean;
  error?: string;
}

/**
 * Trigger a provider sync from the Settings page. The route always answers 200 with a
 * structured summary (even for sync-level failures), so we branch on the result rather
 * than onError — which fires only for transport failures. Either way we refetch status.
 */
export function useSyncProvider(provider: string, label: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postJSON<SyncResult>(`/api/sync/${provider}`, {}),
    onSuccess: (result) => {
      if (result.skipped) {
        toast.info(`${label} sync already running`, {
          description: "Try again in a moment.",
        });
      } else if (result.status === "OK") {
        const n = result.itemsUpserted ?? 0;
        toast.success(`${label} synced`, {
          description: `${n} item${n === 1 ? "" : "s"} updated`,
        });
      } else if (result.needsReauth) {
        toast.error(`${label} needs reconnecting`, {
          description: "Authorization expired — reconnect to resume syncing.",
        });
      } else {
        toast.error(`${label} sync failed`, { description: result.error });
      }
    },
    onError: (err) =>
      toast.error(httpErrorMessage(err, `Couldn't reach ${label}`)),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.syncStatus() });
      qc.invalidateQueries({ queryKey: queryKeys.connections() });
      // The sync may have landed new weight/sleep/activity — refresh every read
      // derived from it, or Today/Trends keep showing pre-sync data.
      invalidateAfterSync(qc);
    },
  });
}
