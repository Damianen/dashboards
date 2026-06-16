"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/query-keys";
import { unwrap } from "@/server/actions/result";
import {
  createSavedFilterAction,
  deleteSavedFilterAction,
  updateSavedFilterAction,
} from "@/server/actions/saved-filters";
import type {
  SavedFilterCreateInput,
  SavedFilterUpdateInput,
} from "@/lib/schemas";

// Saved-filter CRUD is not optimistic (no id/order until the server assigns
// them, and create/update can reject a bad query with FILTER_SYNTAX). The
// caller awaits mutateAsync and surfaces errors inline; here we only reconcile
// caches on success. An update may change the query, so the ["tasks"] family is
// invalidated too — that refetches any open filter view with the new query.

export function useCreateSavedFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SavedFilterCreateInput) =>
      unwrap(await createSavedFilterAction(input)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.savedFilters });
    },
  });
}

export function useUpdateSavedFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: SavedFilterUpdateInput;
    }) => unwrap(await updateSavedFilterAction(id, input)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.savedFilters });
      void qc.invalidateQueries({ queryKey: qk.tasks });
    },
  });
}

export function useDeleteSavedFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteSavedFilterAction(id)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.savedFilters });
    },
  });
}
