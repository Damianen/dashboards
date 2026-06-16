"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/providers/toast-provider";
import { qk } from "@/lib/query-keys";
import {
  createReminderAction,
  deleteReminderAction,
  listRemindersAction,
  updateReminderAction,
} from "@/server/actions/reminders";
import { unwrap } from "@/server/actions/result";
import type { Reminder } from "@/generated/prisma/client";
import type { ReminderCreateInput, ReminderUpdateInput } from "@/lib/schemas";

export function useReminders(taskId: string) {
  return useQuery({
    queryKey: qk.reminders(taskId),
    queryFn: async () => unwrap(await listRemindersAction(taskId)),
  });
}

let tempSeq = 0;

/** Optimistically add a reminder to the task's reminder list, rolling back on error. */
export function useCreateReminder(taskId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const key = qk.reminders(taskId);
  return useMutation({
    mutationFn: async (input: ReminderCreateInput) =>
      unwrap(await createReminderAction(input)),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Reminder[]>(key);
      const now = new Date();
      const optimistic: Reminder = {
        id: `temp-${++tempSeq}`,
        taskId,
        minutesBefore: "minutesBefore" in input ? input.minutesBefore : null,
        absoluteAt: "absoluteAt" in input ? new Date(input.absoluteAt as Date) : null,
        lastFiredFor: null,
        createdAt: now,
        updatedAt: now,
      };
      qc.setQueryData<Reminder[]>(key, [...(prev ?? []), optimistic]);
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast({ message: "Couldn't add reminder", variant: "error" });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
}

export function useUpdateReminder(taskId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const key = qk.reminders(taskId);
  return useMutation({
    mutationFn: async (vars: { id: string; input: ReminderUpdateInput }) =>
      unwrap(await updateReminderAction(vars.id, vars.input)),
    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Reminder[]>(key);
      qc.setQueryData<Reminder[]>(key, (list) =>
        (list ?? []).map((r) =>
          r.id === id
            ? {
                ...r,
                minutesBefore:
                  "minutesBefore" in input ? input.minutesBefore : null,
                absoluteAt:
                  "absoluteAt" in input ? new Date(input.absoluteAt as Date) : null,
                lastFiredFor: null,
              }
            : r,
        ),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast({ message: "Couldn't update reminder", variant: "error" });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteReminder(taskId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const key = qk.reminders(taskId);
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteReminderAction(id)),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Reminder[]>(key);
      qc.setQueryData<Reminder[]>(key, (list) =>
        (list ?? []).filter((r) => r.id !== id),
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast({ message: "Couldn't remove reminder", variant: "error" });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
}
