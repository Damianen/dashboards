"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  CHART,
  CHART_MARGIN,
  gridProps,
  TrendCard,
  tooltipProps,
  xAxisProps,
  yAxisProps,
} from "@/components/trends/trend-card";
import { mergeByDay } from "@/lib/aggregate";
import { useInView } from "@/lib/hooks/use-in-view";
import { useTrend } from "@/lib/hooks/use-trend";
import { useWeightGoal, type WeightGoalResult } from "@/lib/hooks/use-weight-goal";

// Default subtitle plus, when a goal is set, a plain-language projection from the
// measured trend (or an honest "not trending toward it" when the slope says so).
function weightSubtitle(g?: WeightGoalResult): string {
  const base = "Daily · 7-day average (the signal)";
  if (!g || g.goalKg == null) return base;
  if (g.onTrack && g.weeksToGoal != null) {
    if (g.weeksToGoal <= 0) return `Goal ${g.goalKg} kg · reached`;
    const wks = Math.round(g.weeksToGoal);
    return `Goal ${g.goalKg} kg · ~${wks} wk${wks === 1 ? "" : "s"}${
      g.etaDay ? ` (≈ ${g.etaDay})` : ""
    }`;
  }
  return `Goal ${g.goalKg} kg · not trending toward it`;
}

export function WeightCard({ days }: { days: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const weight = useTrend("weight", days, inView);
  const avg = useTrend("weight_7d_avg", days, inView);
  const goal = useWeightGoal(inView);
  const loading = !inView || weight.isLoading || avg.isLoading;
  const data = mergeByDay({ weight: weight.data ?? [], avg: avg.data ?? [] });
  const goalKg = goal.data?.goalKg ?? null;

  return (
    <TrendCard
      innerRef={ref}
      title="Weight"
      subtitle={weightSubtitle(goal.data)}
      loading={loading}
      empty={!loading && data.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps} />
          <YAxis
            {...yAxisProps}
            width={44}
            domain={["dataMin - 1", "dataMax + 1"]}
          />
          <Tooltip {...tooltipProps} />
          {goalKg != null ? (
            <ReferenceLine
              y={goalKg}
              stroke={CHART.c3}
              strokeDasharray="5 3"
              strokeWidth={1.5}
              label={{
                value: "goal",
                position: "insideTopRight",
                fontSize: 10,
                fill: "var(--muted-foreground)",
              }}
            />
          ) : null}
          <Scatter dataKey="weight" name="weight" fill={CHART.muted} />
          <Line
            dataKey="avg"
            name="7-day avg"
            stroke={CHART.c1}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </TrendCard>
  );
}
