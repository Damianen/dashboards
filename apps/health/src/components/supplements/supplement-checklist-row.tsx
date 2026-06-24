"use client";

import { Check } from "lucide-react";

import { useCheck, useUncheck } from "@/lib/hooks/use-supplements";
import { formatNumber } from "@/lib/format";
import type { ChecklistItem } from "@/lib/supplement-checklist";
import { cn } from "@/lib/utils";

/** One tappable checklist row. The whole row is the tap target (≥56px); tapping
 *  toggles the day's log optimistically. */
export function SupplementChecklistRow({
  day,
  item,
}: {
  day: string;
  item: ChecklistItem;
}) {
  const check = useCheck(day);
  const uncheck = useUncheck(day);
  const pending = check.isPending || uncheck.isPending;

  function toggle() {
    if (item.complete) uncheck.mutate(item.id);
    else check.mutate(item.id);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={item.complete}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
        item.complete
          ? "border-primary/30 bg-primary/5"
          : "hover:bg-accent",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          item.complete
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/40",
        )}
      >
        {item.complete && <Check className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate font-medium",
            item.complete && "text-muted-foreground",
          )}
        >
          {item.name}
        </span>
        <span className="text-muted-foreground block text-sm tabular-nums">
          {formatNumber(item.dose, 2)} {item.unit}
        </span>
      </span>
    </button>
  );
}
