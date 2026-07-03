"use client";

import { useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CHART,
  CHART_MARGIN,
  gridProps,
  legendProps,
  tooltipProps,
  xAxisProps,
  yAxisProps,
} from "@/components/trends/trend-card";
import { useE1rm } from "@/lib/hooks/use-e1rm";
import { useExercises } from "@/lib/hooks/use-exercises";
import { useInView } from "@/lib/hooks/use-in-view";

// Estimated-1RM strength progression for ONE exercise (picked via the selector),
// putting heavy-low-rep and lighter-high-rep working sets on one comparable scale.
// PRs (all-time e1RM highs) are overlaid as scatter points. e1RM is a TREND estimate,
// never a tested max. Custom Card (not TrendCard) so the picker stays visible when empty.
export function E1rmCard({ days }: { days: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const exercises = useExercises();
  const [picked, setPicked] = useState<string | null>(null);
  const list = exercises.data ?? [];
  // Default to the first catalog exercise until the user picks one.
  const selected = picked ?? list[0]?.name ?? null;
  const e1rm = useE1rm(selected, days, inView);
  const loading =
    !inView || e1rm.isLoading || (exercises.isLoading && selected === null);
  const points =
    e1rm.data?.map((p) => ({
      day: p.day,
      e1rm: p.e1rmKg,
      // Non-null only on PR days → Scatter renders a marker just there.
      pr: p.isPr ? p.e1rmKg : null,
      // Mean RPE of the day's rated sets; unrated days stay honest gaps.
      rpe: p.avgRpe,
    })) ?? [];
  const empty = !loading && (selected === null || points.length === 0);

  return (
    <Card ref={ref} className="gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-sm leading-tight font-semibold">
            Exercise strength (e1RM)
          </h2>
          <p className="text-muted-foreground text-xs">
            Best est. 1-rep-max per day · ◆ = PR · avg RPE — a trend, not a
            tested max
          </p>
        </div>
        <Select value={selected ?? undefined} onValueChange={setPicked}>
          <SelectTrigger className="h-8 w-36 shrink-0 text-xs">
            <SelectValue placeholder="Exercise" />
          </SelectTrigger>
          <SelectContent>
            {list.map((ex) => (
              <SelectItem key={ex.id} value={ex.name}>
                {ex.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="h-[180px] w-full">
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : empty ? (
          <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
            {selected === null
              ? "No exercises yet"
              : "No working sets for this exercise yet"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={CHART_MARGIN}>
              <CartesianGrid {...gridProps} />
              <XAxis {...xAxisProps} />
              <YAxis
                {...yAxisProps}
                yAxisId="e1rm"
                width={44}
                domain={["dataMin - 2", "dataMax + 2"]}
              />
              <YAxis
                {...yAxisProps}
                yAxisId="rpe"
                orientation="right"
                width={28}
                domain={[1, 10]}
              />
              <Tooltip {...tooltipProps} />
              <Legend {...legendProps} />
              <Line
                yAxisId="e1rm"
                dataKey="e1rm"
                name="e1RM (kg)"
                stroke={CHART.c1}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Scatter yAxisId="e1rm" dataKey="pr" name="PR" fill={CHART.c4} />
              <Line
                yAxisId="rpe"
                dataKey="rpe"
                name="avg RPE"
                stroke={CHART.c3}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
