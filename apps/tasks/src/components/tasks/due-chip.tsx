"use client";

import { CalendarClock } from "lucide-react";

import { DEFAULT_TIMEZONE, formatDueChip, isOverdue } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Compact due-date label; turns destructive-red once the task is overdue. */
export function DueChip({
  dueAt,
  hasDueTime,
  timezone = DEFAULT_TIMEZONE,
  className,
}: {
  dueAt: Date;
  hasDueTime: boolean;
  timezone?: string;
  className?: string;
}) {
  const overdue = isOverdue(dueAt, hasDueTime, timezone);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        overdue ? "text-destructive" : "text-muted-foreground",
        className,
      )}
    >
      <CalendarClock className="size-3" aria-hidden />
      {formatDueChip(dueAt, hasDueTime, timezone)}
    </span>
  );
}
