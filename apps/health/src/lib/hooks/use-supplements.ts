"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getJSON, postJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import type {
  CreateSupplementInput,
  SupplementTimeGroup,
  UpdateSupplementInput,
} from "@/lib/schemas/supplement";
import type { ChecklistGroup } from "@/lib/supplement-checklist";
// Type-only import: erased at build time, so no server code is bundled.
import type { SupplementView } from "@/server/services/supplements";

/** The shape the client receives: Dates serialise to ISO strings over HTTP. */
export type SupplementDTO = Omit<SupplementView, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

// ----- CHECKLIST -----

export function useChecklist(day: string) {
  return useQuery({
    queryKey: queryKeys.supplementChecklist(day),
    queryFn: () =>
      getJSON<ChecklistGroup[]>(`/api/supplements/checklist?day=${day}`),
  });
}

function withItemComplete(
  groups: ChecklistGroup[],
  supplementId: string,
  complete: boolean,
): ChecklistGroup[] {
  return groups.map((g) => {
    if (!g.items.some((i) => i.id === supplementId)) return g;
    const items = g.items.map((i) =>
      i.id === supplementId ? { ...i, complete } : i,
    );
    return { ...g, items, doneCount: items.filter((i) => i.complete).length };
  });
}

function withGroupComplete(
  groups: ChecklistGroup[],
  timeGroup: SupplementTimeGroup,
  complete: boolean,
): ChecklistGroup[] {
  return groups.map((g) => {
    if (g.timeGroup !== timeGroup) return g;
    const items = g.items.map((i) => ({ ...i, complete }));
    return { ...g, items, doneCount: complete ? items.length : 0 };
  });
}

/** Shared mutation wiring for the four check/uncheck flavours: optimistic patch
 *  of the cached checklist, rollback on error, server truth on success, and a
 *  summary refresh on settle (the daily_summary count derives from these rows). */
function useChecklistMutation<TVars>(
  day: string,
  opts: {
    request: (vars: TVars) => Promise<ChecklistGroup[]>;
    optimistic: (groups: ChecklistGroup[], vars: TVars) => ChecklistGroup[];
    errorMessage: string;
  },
) {
  const qc = useQueryClient();
  const key = queryKeys.supplementChecklist(day);
  return useMutation({
    mutationFn: opts.request,
    onMutate: async (vars: TVars) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ChecklistGroup[]>(key);
      if (previous) qc.setQueryData(key, opts.optimistic(previous, vars));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      toast.error(opts.errorMessage);
    },
    onSuccess: (groups) => qc.setQueryData(key, groups),
    onSettled: () => {
      // Converge after any race (rapid taps), and refresh the day's summary count.
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: queryKeys.summary(day) });
      // Checks feed the supplement streak (adherence) and any caffeine snapshot
      // moves the water target — refresh both or Today's cards go stale.
      void qc.invalidateQueries({ queryKey: queryKeys.adherence(day) });
      void qc.invalidateQueries({ queryKey: queryKeys.water(day) });
    },
  });
}

export function useCheck(day: string) {
  return useChecklistMutation<string>(day, {
    request: (supplementId) =>
      postJSON<ChecklistGroup[]>("/api/supplements/check", {
        supplementId,
        day,
      }),
    optimistic: (groups, supplementId) =>
      withItemComplete(groups, supplementId, true),
    errorMessage: "Couldn't check supplement",
  });
}

export function useUncheck(day: string) {
  return useChecklistMutation<string>(day, {
    request: (supplementId) =>
      postJSON<ChecklistGroup[]>("/api/supplements/uncheck", {
        supplementId,
        day,
      }),
    optimistic: (groups, supplementId) =>
      withItemComplete(groups, supplementId, false),
    errorMessage: "Couldn't uncheck supplement",
  });
}

export function useCheckGroup(day: string) {
  return useChecklistMutation<SupplementTimeGroup>(day, {
    request: (timeGroup) =>
      postJSON<{ newlyChecked: number; checklist: ChecklistGroup[] }>(
        "/api/supplements/check-group",
        { timeGroup, day },
      ).then((r) => r.checklist),
    optimistic: (groups, timeGroup) =>
      withGroupComplete(groups, timeGroup, true),
    errorMessage: "Couldn't mark group",
  });
}

export function useUncheckGroup(day: string) {
  return useChecklistMutation<SupplementTimeGroup>(day, {
    request: (timeGroup) =>
      postJSON<{ unchecked: number; checklist: ChecklistGroup[] }>(
        "/api/supplements/uncheck-group",
        { timeGroup, day },
      ).then((r) => r.checklist),
    optimistic: (groups, timeGroup) =>
      withGroupComplete(groups, timeGroup, false),
    errorMessage: "Couldn't clear group",
  });
}

// ----- LIST MANAGEMENT -----

export function useSupplements(includeArchived: boolean) {
  const qs = includeArchived ? "?includeArchived=true" : "";
  return useQuery({
    queryKey: queryKeys.supplementList(includeArchived),
    queryFn: () => getJSON<SupplementDTO[]>(`/api/supplements${qs}`),
  });
}

export function useCreateSupplement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplementInput) =>
      postJSON<SupplementDTO>("/api/supplements", input),
    onError: () => toast.error("Couldn't add supplement"),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.supplements() });
    },
  });
}

export function useUpdateSupplement(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSupplementInput) =>
      fetch(`/api/supplements/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }).then((res) => {
        if (!res.ok) throw new Error("update failed");
        return res.json() as Promise<SupplementDTO>;
      }),
    onError: () => toast.error("Couldn't save supplement"),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.supplements() });
    },
  });
}

interface ArchiveVars {
  id: string;
  archived: boolean;
}

export function useArchiveSupplement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: ArchiveVars) =>
      postJSON<SupplementDTO>(`/api/supplements/${id}/archive`, { archived }),
    onMutate: async ({ id, archived }) => {
      await qc.cancelQueries({ queryKey: queryKeys.supplements() });
      const snapshots = qc.getQueriesData({ queryKey: queryKeys.supplements() });
      for (const [key, data] of snapshots) {
        if (!Array.isArray(data)) continue;
        qc.setQueryData<SupplementDTO[]>(
          key,
          data.map((s) => (s.id === id ? { ...s, archived } : s)),
        );
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error("Couldn't update supplement");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.supplements() });
    },
  });
}

interface ReorderVars {
  timeGroup: SupplementTimeGroup;
  ids: string[];
}

export function useReorderSupplements() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ timeGroup, ids }: ReorderVars) =>
      postJSON<SupplementDTO[]>("/api/supplements/reorder", { timeGroup, ids }),
    onMutate: async ({ timeGroup, ids }) => {
      await qc.cancelQueries({ queryKey: queryKeys.supplements() });
      const snapshots = qc.getQueriesData({ queryKey: queryKeys.supplements() });
      const rank = new Map(ids.map((id, i) => [id, i]));
      for (const [key, data] of snapshots) {
        if (!Array.isArray(data)) continue;
        // Reorder only this group's affected rows, in place — slots held by other
        // groups (and archived rows not in `ids`) are left exactly where they are.
        const reordered = data
          .filter((s) => s.timeGroup === timeGroup && rank.has(s.id))
          .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
        let next = 0;
        qc.setQueryData<SupplementDTO[]>(
          key,
          data.map((s) =>
            s.timeGroup === timeGroup && rank.has(s.id)
              ? reordered[next++]
              : s,
          ),
        );
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error("Couldn't reorder");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.supplements() });
    },
  });
}
