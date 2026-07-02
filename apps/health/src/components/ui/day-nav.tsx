"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { shiftDay, todayLocal } from "@/lib/dates";
import { dayHeading } from "@/lib/format";

/**
 * Arrow day-pager whose center label opens a date-picker sheet. `day` and
 * `onChange` speak civil "YYYY-MM-DD" strings that are NEVER round-tripped
 * through Date — the native input's value string IS the civil day. Future days
 * are blocked twice: the right arrow disables at today and picks past today
 * are ignored (lexicographic compare is exact on YYYY-MM-DD).
 */
export function DayNav({
  day,
  onChange,
}: {
  day: string;
  onChange: (day: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const today = todayLocal();

  function pick(next: string) {
    if (next === "" || next > today) return; // cleared input / future date
    onChange(next);
    setPickerOpen(false);
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Previous day"
        onClick={() => onChange(shiftDay(day, -1))}
        className="hover:bg-accent flex size-9 items-center justify-center rounded-md transition-colors"
      >
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Pick a date"
        onClick={() => setPickerOpen(true)}
        className="hover:bg-accent min-w-24 rounded-md px-2 py-2 text-center text-sm font-medium transition-colors"
      >
        {dayHeading(day, today)}
      </button>
      <button
        type="button"
        aria-label="Next day"
        onClick={() => onChange(shiftDay(day, 1))}
        disabled={day === today}
        className="hover:bg-accent flex size-9 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronRight className="size-5" aria-hidden />
      </button>

      <BottomSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        variant="menu"
        title="Go to date"
        description="Jump to any past day."
        showTitle
        titleClassName="text-base font-semibold"
        bodyClassName="space-y-3"
      >
        <input
          type="date"
          aria-label="Date"
          value={day}
          max={today}
          onChange={(e) => pick(e.target.value)}
          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-12 w-full rounded-md border bg-transparent px-3 text-base shadow-xs outline-none focus-visible:ring-[3px]"
        />
        <Button
          variant="outline"
          className="h-11 w-full"
          onClick={() => {
            onChange(today);
            setPickerOpen(false);
          }}
        >
          Jump to today
        </Button>
      </BottomSheet>
    </div>
  );
}
