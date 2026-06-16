"use client";

import { Bell, Plus, X } from "lucide-react";
import * as React from "react";

import {
  useCreateReminder,
  useDeleteReminder,
  useReminders,
} from "@/hooks/use-reminder-mutations";
import { formatDueChip } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Reminder } from "@/generated/prisma/client";

import { DueDateField } from "./due-date-field";

const PRESETS: { label: string; minutesBefore: number }[] = [
  { label: "At due time", minutesBefore: 0 },
  { label: "10 min before", minutesBefore: 10 },
  { label: "1 hour before", minutesBefore: 60 },
  { label: "1 day before", minutesBefore: 1440 },
];

function describeReminder(reminder: Reminder, timezone: string): string {
  if (reminder.absoluteAt !== null)
    return formatDueChip(new Date(reminder.absoluteAt), true, timezone);
  const minutes = reminder.minutesBefore ?? 0;
  if (minutes === 0) return "At due time";
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days > 1 ? "s" : ""} before`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours > 1 ? "s" : ""} before`;
  }
  return `${minutes} minutes before`;
}

/** Reminders section for the task detail sheet: list + add (preset / absolute). */
export function RemindersField({
  taskId,
  timezone,
}: {
  taskId: string;
  timezone: string;
}) {
  const { data: reminders } = useReminders(taskId);
  const create = useCreateReminder(taskId);
  const remove = useDeleteReminder(taskId);
  const [adding, setAdding] = React.useState(false);

  return (
    <div className="py-1">
      <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
        <Bell className="size-5 shrink-0" aria-hidden />
        <span>Reminders</span>
      </div>

      {(reminders ?? []).map((reminder) => (
        <div
          key={reminder.id}
          className="flex min-h-11 items-center gap-2 pl-7 text-sm"
        >
          <span className="flex-1">{describeReminder(reminder, timezone)}</span>
          <button
            type="button"
            aria-label="Remove reminder"
            onClick={() => remove.mutate(reminder.id)}
            className="grid size-8 place-items-center rounded-md text-muted-foreground active:bg-muted"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ))}

      {adding ? (
        <div className="pl-7">
          <div className="flex flex-wrap gap-1.5 py-1">
            {PRESETS.map((preset) => (
              <button
                key={preset.minutesBefore}
                type="button"
                onClick={() => {
                  create.mutate({ taskId, minutesBefore: preset.minutesBefore });
                  setAdding(false);
                }}
                className="rounded-full border border-border px-3 py-1 text-xs active:bg-muted"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <DueDateField
            dueAt={null}
            hasDueTime={false}
            timezone={timezone}
            onChange={(change) => {
              if (change.dueAt) {
                create.mutate({ taskId, absoluteAt: change.dueAt });
                setAdding(false);
              }
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={cn(
            "flex min-h-11 items-center gap-2 pl-7 text-sm text-muted-foreground active:opacity-70",
          )}
        >
          <Plus className="size-4" aria-hidden />
          Add reminder
        </button>
      )}
    </div>
  );
}
