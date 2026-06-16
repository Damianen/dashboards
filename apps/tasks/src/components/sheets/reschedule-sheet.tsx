"use client";

import * as React from "react";
import {
  CalendarArrowUp,
  CalendarDays,
  CalendarRange,
  Pencil,
  Sofa,
} from "lucide-react";

import {
  DueDateField,
  type DueChange,
} from "@/components/sheets/due-date-field";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useUpdateTask } from "@/hooks/use-task-mutations";
import {
  addDaysToDayStart,
  DEFAULT_TIMEZONE,
  formatDueChip,
  zonedDayStart,
} from "@/lib/dates";
import type { TaskWithLabels } from "@/server/services/tasks";

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** 0 (Sun) … 6 (Sat) for `now` in `timeZone`. */
function weekday(now: Date, timeZone: string): number {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(now);
  return WEEKDAY_INDEX[short] ?? 0;
}

interface QuickOption {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  dueAt: Date;
}

/** All-day targets. Weekend = upcoming Saturday; Next week = next Monday (never today). */
function quickOptions(timeZone: string, now: Date): QuickOption[] {
  const today = zonedDayStart(now, timeZone);
  const dow = weekday(now, timeZone);
  const toSaturday = (6 - dow + 7) % 7;
  const toMonday = ((1 - dow + 7) % 7) || 7;
  return [
    { key: "today", label: "Today", icon: CalendarDays, dueAt: today },
    {
      key: "tomorrow",
      label: "Tomorrow",
      icon: CalendarArrowUp,
      dueAt: addDaysToDayStart(today, 1, timeZone),
    },
    {
      key: "weekend",
      label: "This weekend",
      icon: Sofa,
      dueAt: addDaysToDayStart(today, toSaturday, timeZone),
    },
    {
      key: "nextweek",
      label: "Next week",
      icon: CalendarRange,
      dueAt: addDaysToDayStart(today, toMonday, timeZone),
    },
  ];
}

export function RescheduleSheet({
  task,
  open,
  onOpenChange,
}: {
  task: TaskWithLabels | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateTask();
  const [picking, setPicking] = React.useState(false);

  const timezone = task?.timezone ?? DEFAULT_TIMEZONE;

  // Reset the inline date picker on every close path (no effect needed).
  function handleOpenChange(next: boolean) {
    if (!next) setPicking(false);
    onOpenChange(next);
  }

  function apply(change: DueChange) {
    if (task)
      update.mutate({
        id: task.id,
        edit: { dueAt: change.dueAt, hasDueTime: change.hasDueTime },
      });
    handleOpenChange(false);
  }

  const options = task ? quickOptions(timezone, new Date()) : [];

  return (
    <Drawer open={open} onOpenChange={handleOpenChange} repositionInputs>
      <DrawerContent
        showHandle={false}
        className="pb-[max(env(safe-area-inset-bottom),1rem)]"
      >
        <DrawerTitle className="px-4 pt-4 pb-1 text-sm font-semibold">
          Reschedule
        </DrawerTitle>
        <div className="flex flex-col px-2 py-1">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => apply({ dueAt: o.dueAt, hasDueTime: false })}
              className="flex min-h-[52px] items-center gap-3 rounded-lg px-3 text-left active:bg-muted"
            >
              <o.icon className="size-5 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-sm font-medium">{o.label}</span>
              <span className="text-xs text-muted-foreground">
                {formatDueChip(o.dueAt, false, timezone)}
              </span>
            </button>
          ))}
          {picking ? (
            <div className="px-3 py-2">
              <DueDateField
                dueAt={task?.dueAt ?? null}
                hasDueTime={task?.hasDueTime ?? false}
                timezone={timezone}
                onChange={apply}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="flex min-h-[52px] items-center gap-3 rounded-lg px-3 text-left active:bg-muted"
            >
              <Pencil className="size-5 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-sm font-medium">Pick a date</span>
            </button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
