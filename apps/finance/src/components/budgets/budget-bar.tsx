import type { BudgetStatus } from "@/lib/budget-pacing";
import { cn } from "@/lib/utils";

// Spend fill relative to the limit, with a marker showing where the month
// "should" be today (the pace line). Colour encodes status.
const FILL: Record<BudgetStatus, string> = {
  under: "bg-emerald-500",
  on: "bg-amber-500",
  over: "bg-destructive",
};

function clampPct(fraction: number): number {
  return Math.min(100, Math.max(0, fraction * 100));
}

export function BudgetBar({
  spentFraction,
  paceFraction,
  status,
}: {
  spentFraction: number;
  paceFraction: number;
  status: BudgetStatus;
}) {
  return (
    <div className="relative h-2 w-full">
      <div className="absolute inset-0 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", FILL[status])}
          style={{ width: `${clampPct(spentFraction)}%` }}
        />
      </div>
      <div
        className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-foreground/70"
        style={{ left: `${clampPct(paceFraction)}%` }}
        aria-hidden
        title="Where the month should be today"
      />
    </div>
  );
}
