"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { del } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";

/**
 * Delete a session (and via cascade its sets + plan snapshot). The dead detail
 * query is REMOVED, not invalidated — an invalidate would refetch a 404.
 */
export function useDeleteSession(sessionId: string, day: string) {
  const qc = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: () => del(`/api/lifting/sessions/${sessionId}`),
    onSuccess: () => {
      toast.success("Session deleted");
      qc.removeQueries({ queryKey: queryKeys.session(sessionId) });
      void qc.invalidateQueries({ queryKey: queryKeys.lifting() });
      void qc.invalidateQueries({ queryKey: queryKeys.summary(day) });
      router.push("/lifting");
    },
    onError: () => toast.error("Couldn't delete session"),
  });
}
