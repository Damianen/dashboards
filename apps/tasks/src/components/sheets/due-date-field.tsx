"use client";

import { CalendarDays, Clock, X } from "lucide-react";
import * as React from "react";

import {
  DEFAULT_TIMEZONE,
  dueAtToInputValues,
  inputValuesToDueAt,
} from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface DueChange {
  dueAt: Date | null;
  hasDueTime: boolean;
}

/**
 * Native date (+ optional time) editor. Clearing the date removes the due
 * date; "Add time" reveals the time input and switches the task to timed.
 * Inputs are text-base to keep iOS from zooming on focus.
 */
export function DueDateField({
  dueAt,
  hasDueTime,
  timezone = DEFAULT_TIMEZONE,
  onChange,
}: {
  dueAt: Date | null;
  hasDueTime: boolean;
  timezone?: string;
  onChange: (next: DueChange) => void;
}) {
  const values = dueAt
    ? dueAtToInputValues(dueAt, hasDueTime, timezone)
    : null;
  const [showTime, setShowTime] = React.useState(hasDueTime);

  const dateValue = values?.date ?? "";
  const timeValue = values?.time ?? "";

  function commit(date: string, time: string | null) {
    if (date === "") {
      onChange({ dueAt: null, hasDueTime: false });
      return;
    }
    onChange(inputValuesToDueAt(date, time, timezone));
  }

  return (
    <div className="flex items-center gap-2">
      <CalendarDays
        className="size-5 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <input
        type="date"
        value={dateValue}
        aria-label="Due date"
        onChange={(e) => commit(e.target.value, showTime ? timeValue : null)}
        className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none"
      />

      {dateValue !== "" && (
        <>
          {showTime ? (
            <input
              type="time"
              value={timeValue}
              aria-label="Due time"
              onChange={(e) => commit(dateValue, e.target.value || null)}
              className="h-11 w-[7.5rem] bg-transparent text-base outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowTime(true)}
              className="inline-flex h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-muted-foreground active:bg-muted"
            >
              <Clock className="size-4" aria-hidden />
              Add time
            </button>
          )}
          <button
            type="button"
            aria-label="Clear due date"
            onClick={() => {
              setShowTime(false);
              onChange({ dueAt: null, hasDueTime: false });
            }}
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted",
            )}
          >
            <X className="size-4" aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}
