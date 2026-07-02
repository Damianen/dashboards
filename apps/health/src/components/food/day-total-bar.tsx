"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import type { DetailTotals, MacroTotals } from "@/lib/food";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

function Metric({
  value,
  unit,
  label,
}: {
  value: string;
  unit?: string;
  label: string;
}) {
  return (
    <div className="text-center">
      <div className="text-lg font-semibold tabular-nums leading-none">
        {value}
        {unit ? <span className="text-muted-foreground text-xs">{unit}</span> : null}
      </div>
      <div className="text-muted-foreground mt-1 text-[10px] tracking-wide uppercase">
        {label}
      </div>
    </div>
  );
}

/** null → "—": a dash means no entry reported the field, not a zero intake. */
function detail(value: number | null): string {
  return value == null ? "—" : formatNumber(value, 1);
}

/**
 * Sticky day-total bar: the four summary macros, expandable (tap anywhere on
 * it — well past 44px tall) to a second row of the captured detail macros
 * (fiber/sugar/salt), summed client-side from the day's entries.
 */
export function DayTotalBar({
  total,
  details,
}: {
  total: MacroTotals;
  details: DetailTotals;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label="Day totals — tap for fiber, sugar and salt"
      onClick={() => setExpanded((v) => !v)}
      className="bg-card/90 supports-[backdrop-filter]:bg-card/75 sticky top-2 z-20 block w-full rounded-xl border px-3 py-3 shadow-sm backdrop-blur"
    >
      <div className="grid grid-cols-4 gap-2">
        <Metric value={formatNumber(total.kcal)} label="kcal" />
        <Metric value={formatNumber(total.proteinG, 1)} unit="g" label="protein" />
        <Metric value={formatNumber(total.carbG, 1)} unit="g" label="carbs" />
        <Metric value={formatNumber(total.fatG, 1)} unit="g" label="fat" />
      </div>
      {expanded && (
        <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3">
          <Metric value={detail(details.fiberG)} unit={details.fiberG == null ? undefined : "g"} label="fiber" />
          <Metric value={detail(details.sugarG)} unit={details.sugarG == null ? undefined : "g"} label="sugar" />
          <Metric value={detail(details.saltG)} unit={details.saltG == null ? undefined : "g"} label="salt" />
        </div>
      )}
      <ChevronDown
        className={cn(
          "text-muted-foreground absolute right-2 top-2 size-3.5 transition-transform",
          expanded && "rotate-180",
        )}
        aria-hidden
      />
    </button>
  );
}
