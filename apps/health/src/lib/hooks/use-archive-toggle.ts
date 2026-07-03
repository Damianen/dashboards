"use client";

import {
  useMutation,
  type UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { httpErrorMessage } from "@/lib/fetcher";

/**
 * Shared optimistic archive/restore toggle for the archivable list domains
 * (supplements, templates, meals, custom foods, daily plans). Rows are hidden,
 * never deleted.
 *
 * onMutate cancels + snapshots every cache under `prefix` and flips `archived`
 * on the matching row in each cached list — detail caches (single objects) are
 * skipped via the Array guard. onError restores the snapshots and toasts;
 * onSettled invalidates `prefix` + `alsoInvalidate` so server truth converges
 * either way.
 */
export function useArchiveToggle<
  TDto extends { id: string; archived: boolean },
>(opts: {
  /** Snapshot + settle-invalidate scope, e.g. queryKeys.meals(). */
  prefix: readonly unknown[];
  request: (vars: { id: string; archived: boolean }) => Promise<unknown>;
  /** Fallback toast copy — a server { error } body wins (httpErrorMessage). */
  errorMessage: string;
  /** Some archive hooks toast on success, some don't — omit to stay silent. */
  successMessage?: (archived: boolean) => string;
  /** Extra prefixes to refresh on settle, e.g. the food recents strip. */
  alsoInvalidate?: readonly (readonly unknown[])[];
}): UseMutationResult<unknown, Error, { id: string; archived: boolean }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: opts.request,
    onMutate: async ({ id, archived }) => {
      await qc.cancelQueries({ queryKey: opts.prefix });
      // Snapshot every cache under the prefix and flip the flag optimistically.
      // Detail caches (single objects) are skipped via the Array guard.
      const snapshots = qc.getQueriesData({ queryKey: opts.prefix });
      for (const [key, data] of snapshots) {
        if (!Array.isArray(data)) continue;
        qc.setQueryData<TDto[]>(
          key,
          data.map((row: TDto) => (row.id === id ? { ...row, archived } : row)),
        );
      }
      return { snapshots };
    },
    onError: (err, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(httpErrorMessage(err, opts.errorMessage));
    },
    onSuccess: (_data, { archived }) => {
      if (opts.successMessage) toast.success(opts.successMessage(archived));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: opts.prefix });
      for (const prefix of opts.alsoInvalidate ?? []) {
        void qc.invalidateQueries({ queryKey: prefix });
      }
    },
  });
}
