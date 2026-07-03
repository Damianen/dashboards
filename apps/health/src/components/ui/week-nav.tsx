"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { mondayOf } from "@/lib/aggregate";
import { shiftDay, todayLocal } from "@/lib/dates";
import { weekRangeLabel } from "@/lib/format";

/**
 * Arrow week-pager (day-nav's weekly sibling). `weekStart` and `onChange` speak
 * civil "YYYY-MM-DD" Mondays — a ±7-day shiftDay step always lands on the
 * neighbouring Monday, so no other week math exists here. Future weeks are
 * blocked: the right arrow disables at the current week. Arrows are 44px
 * touch targets.
 */
export function WeekNav({
  weekStart,
  onChange,
}: {
  weekStart: string;
  onChange: (weekStart: string) => void;
}) {
  const currentWeek = mondayOf(todayLocal());
  const isCurrentWeek = weekStart === currentWeek;

  return (
    <div className="flex items-center justify-between gap-1">
      <button
        type="button"
        aria-label="Previous week"
        onClick={() => onChange(shiftDay(weekStart, -7))}
        className="hover:bg-accent flex size-11 items-center justify-center rounded-md transition-colors"
      >
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      <span className="text-sm font-medium tabular-nums">
        {isCurrentWeek
          ? "This week"
          : weekRangeLabel(weekStart, shiftDay(weekStart, 6))}
      </span>
      <button
        type="button"
        aria-label="Next week"
        onClick={() => onChange(shiftDay(weekStart, 7))}
        disabled={isCurrentWeek}
        className="hover:bg-accent flex size-11 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronRight className="size-5" aria-hidden />
      </button>
    </div>
  );
}
