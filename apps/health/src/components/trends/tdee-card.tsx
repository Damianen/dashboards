"use client";

import { useState } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useInView } from "@/lib/hooks/use-in-view";
import { useSetTdeeWindow, useTdee } from "@/lib/hooks/use-tdee";
import type { TdeeWindow } from "@/lib/schemas/insights";
import type { Confidence } from "@/lib/tdee";

const WINDOWS: TdeeWindow[] = [14, 21, 28];

const CONFIDENCE: Record<
  Confidence,
  { variant: "default" | "secondary" | "outline"; label: string }
> = {
  low: { variant: "outline", label: "Low confidence" },
  medium: { variant: "secondary", label: "Medium confidence" },
  high: { variant: "default", label: "High confidence" },
};

// Round to the nearest 10 kcal — the model (linear weight→energy at 7700 kcal/kg) is
// nowhere near single-kcal precision, so don't imply it is.
function round10(n: number): number {
  return Math.round(n / 10) * 10;
}

// Signed "kg/wk", with a tiny dead-zone so float noise around zero reads as flat.
function fmtTrend(kgPerWeek: number): string {
  const v = Math.abs(kgPerWeek) < 0.005 ? 0 : kgPerWeek;
  return `${v > 0 ? "+" : ""}${v.toFixed(2)} kg/wk`;
}

function TrendIcon({ slope }: { slope: number }) {
  if (slope < -0.005) return <TrendingDown className="size-4 text-emerald-500" />;
  if (slope > 0.005) return <TrendingUp className="size-4 text-amber-500" />;
  return <Minus className="text-muted-foreground size-4" />;
}

/**
 * Empirical TDEE (true maintenance calories) for a rolling window, derived ONLY from
 * logged intake + the measured weight trend — never device/active calories, never a
 * net. Self-contained: its own 14/21/28 window (independent of the page range), which
 * persists as the default. Confidence is driven by logging completeness; a low badge
 * carries a plain-language "log more" caveat.
 */
export function TdeeCard() {
  const [ref, inView] = useInView<HTMLDivElement>();
  // null = use the server's stored default; the response echoes the resolved window,
  // which is what the selector highlights until the user picks one explicitly.
  const [picked, setPicked] = useState<TdeeWindow | null>(null);
  const { data, isLoading, isError } = useTdee(picked, inView);
  const setWindow = useSetTdeeWindow();

  const effectiveWindow = picked ?? data?.window ?? 14;
  const loading = !inView || isLoading;

  function onPick(value: string) {
    const w = Number(value) as TdeeWindow;
    setPicked(w);
    setWindow.mutate(w);
  }

  return (
    <Card ref={ref} className="gap-3 p-4">
      <div className="space-y-0.5">
        <h2 className="text-sm leading-tight font-semibold">
          Maintenance — empirical TDEE
        </h2>
        <p className="text-muted-foreground text-xs">
          From your logged intake + weight trend — never device calories
        </p>
      </div>

      <Segmented
        ariaLabel="TDEE window"
        value={String(effectiveWindow)}
        onChange={onPick}
        options={WINDOWS.map((w) => ({ value: String(w), label: `${w} days` }))}
      />

      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : isError || !data ? (
        <p className="text-muted-foreground py-4 text-sm">
          Couldn&apos;t load the estimate.
        </p>
      ) : data.tdee === null ? (
        <div className="py-2">
          <p className="text-sm font-medium">Not enough data yet</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Needs at least two weigh-ins and some logged food in this window —
            based on {data.nLoggedDays} logged of {data.nDays} days.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="text-3xl font-semibold tabular-nums">
                {round10(data.tdee).toLocaleString("en-GB")}
              </div>
              <div className="text-muted-foreground text-xs">
                kcal/day maintenance
              </div>
            </div>
            <Badge variant={CONFIDENCE[data.confidence].variant}>
              {CONFIDENCE[data.confidence].label}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-muted-foreground text-xs">Weight trend</div>
              <div className="flex items-center gap-1 font-medium tabular-nums">
                <TrendIcon slope={data.slopeKgPerWeek} />
                {fmtTrend(data.slopeKgPerWeek)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Mean intake</div>
              <div className="font-medium tabular-nums">
                {data.meanIntake !== null
                  ? `${round10(data.meanIntake).toLocaleString("en-GB")} kcal`
                  : "—"}
              </div>
            </div>
          </div>

          <p
            className={
              data.confidence === "low"
                ? "text-amber-600 text-xs dark:text-amber-400"
                : "text-muted-foreground text-xs"
            }
          >
            Based on {data.nLoggedDays} logged of {data.nDays} days
            {data.confidence === "low" ? " — log more for accuracy." : "."}
          </p>
        </div>
      )}
    </Card>
  );
}
