"use client";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Spoken label when the visible one is terse (e.g. "—" → "No slot"). */
  ariaLabel?: string;
}

/**
 * A pill segmented control: a row of mutually-exclusive options inside a muted
 * track, the active one raised. Segments are ≥44px tall for touch in both
 * sizes. Generic over a string union so callers stay type-safe (e.g. "REPS" |
 * "VOLUME"). `columns` wraps options onto extra rows (e.g. 6 options at
 * columns={3} render 3×2) so segments keep full height instead of shrinking;
 * `size="sm"` tightens padding/text for 4–5 options that must fit one row.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
  columns,
  size = "default",
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  ariaLabel?: string;
  className?: string;
  /** Grid columns; defaults to one row of all options. */
  columns?: number;
  size?: "default" | "sm";
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("bg-muted grid gap-1 rounded-lg p-1", className)}
      style={{
        gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))`,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            aria-label={opt.ariaLabel}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex min-h-11 items-center justify-center rounded-md font-medium transition-colors",
              size === "sm" ? "px-2 text-xs" : "px-3 text-sm",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
