"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getJSON, httpErrorMessage, patchJSON } from "@/lib/fetcher";

/** What a settings card needs from its GET/PATCH pair — see useSetting. */
export interface SettingHandle<T> {
  data: T | undefined;
  /** Initial load in flight. */
  isPending: boolean;
  /** Load failed → the card shows Retry, never an editable empty form. */
  isError: boolean;
  refetch: () => void;
  /** PATCH `url`; the card safeParses before calling. */
  save: (body: unknown) => void;
  saving: boolean;
}

/**
 * One settings endpoint as a query + mutation pair: GET `url` under `key`,
 * PATCH `url` on save. A successful save writes the server-normalized response
 * back into the cache (SettingCard keys its form on that data, so the form
 * re-seeds without effects), then invalidates each `invalidateOnSave` prefix —
 * the per-card fanout to whatever reads derive from the setting.
 */
export function useSetting<T>(opts: {
  key: readonly unknown[];
  url: string;
  invalidateOnSave?: readonly (readonly unknown[])[];
  successMessage: string;
  errorMessage: string;
}): SettingHandle<T> {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: opts.key,
    queryFn: () => getJSON<T>(opts.url),
  });

  const mutation = useMutation({
    mutationFn: (body: unknown) => patchJSON<T>(opts.url, body),
    onSuccess: (response) => {
      qc.setQueryData(opts.key, response);
      for (const prefix of opts.invalidateOnSave ?? []) {
        void qc.invalidateQueries({ queryKey: prefix });
      }
      toast.success(opts.successMessage);
    },
    onError: (err) => toast.error(httpErrorMessage(err, opts.errorMessage)),
  });

  return {
    data: query.data,
    isPending: query.isPending,
    isError: query.isError,
    refetch: () => void query.refetch(),
    save: mutation.mutate,
    saving: mutation.isPending,
  };
}
