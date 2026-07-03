"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  CHART,
  CHART_MARGIN,
  gridProps,
  legendProps,
  TrendCard,
  tooltipProps,
  xAxisProps,
  yAxisProps,
} from "@/components/trends/trend-card";
import { mergeByDay } from "@/lib/aggregate";
import { useInView } from "@/lib/hooks/use-in-view";
import { useTrend } from "@/lib/hooks/use-trend";

export function ActivityCard({ days }: { days: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const steps = useTrend("steps", days, inView);
  const active = useTrend("active_kcal", days, inView);
  const loading = !inView || steps.isLoading || active.isLoading;
  const data = mergeByDay({
    steps: steps.data ?? [],
    active: active.data ?? [],
  });

  return (
    <TrendCard
      innerRef={ref}
      title="Activity — trend (wearable estimate)"
      subtitle="Steps · active kcal — wrist EE is a relative trend, not a truth"
      loading={loading}
      empty={!loading && data.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} yAxisId="steps" width={44} />
          <YAxis
            {...yAxisProps}
            yAxisId="kcal"
            orientation="right"
            width={44}
          />
          <Tooltip {...tooltipProps} />
          <Legend {...legendProps} />
          <Bar
            yAxisId="steps"
            dataKey="steps"
            name="steps"
            fill={CHART.muted}
            fillOpacity={0.35}
            radius={[2, 2, 0, 0]}
          />
          <Line
            yAxisId="kcal"
            dataKey="active"
            name="active kcal — trend (wearable estimate)"
            stroke={CHART.muted}
            strokeWidth={1.5}
            strokeDasharray="4 2"
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </TrendCard>
  );
}
