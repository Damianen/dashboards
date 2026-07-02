"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { postJSON } from "@/lib/fetcher";
import { invalidateAfterSync, queryKeys } from "@/lib/hooks/keys";

/** One entry per source from POST /api/sync/all (mirrors the service's SyncAllResult). */
interface SyncAllResult {
  source: string;
  status: "OK" | "ERROR";
  itemsUpserted: number;
  error?: string;
}

/**
 * Trigger a sequential sync of every source from the Settings card. The route answers 200
 * with a per-source summary even when individual sources fail, so we summarise the array
 * rather than relying on onError (which fires only for transport failures). Either way we
 * refetch sync status and connections.
 */
export function useSyncAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postJSON<SyncAllResult[]>("/api/sync/all", {}),
    onSuccess: (results) => {
      const items = results.reduce((sum, r) => sum + r.itemsUpserted, 0);
      const failed = results.filter((r) => r.status === "ERROR").length;
      if (failed === 0) {
        toast.success("All sources synced", {
          description: `${items} item${items === 1 ? "" : "s"} updated`,
        });
      } else {
        toast.error(
          `${failed} source${failed === 1 ? "" : "s"} failed to sync`,
          { description: `${items} item${items === 1 ? "" : "s"} updated` },
        );
      }
    },
    onError: () => toast.error("Couldn't reach the server"),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.syncStatus() });
      qc.invalidateQueries({ queryKey: queryKeys.connections() });
      // The sync may have landed new weight/sleep/activity — refresh every read
      // derived from it, or Today/Trends keep showing pre-sync data.
      invalidateAfterSync(qc);
    },
  });
}
