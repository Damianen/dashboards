"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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

// Body fat % and muscle mass (Withings) — synced but previously never charted.
// Dual axis: the two metrics live on very different scales.
export function BodyCompositionCard({ days }: { days: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const bodyFat = useTrend("body_fat_pct", days, inView);
  const muscle = useTrend("muscle_mass_kg", days, inView);
  const loading = !inView || bodyFat.isLoading || muscle.isLoading;
  const data = mergeByDay({
    bodyFat: bodyFat.data ?? [],
    muscle: muscle.data ?? [],
  });

  return (
    <TrendCard
      innerRef={ref}
      title="Body composition"
      subtitle="Body fat % · muscle mass (kg) — Withings"
      loading={loading}
      empty={!loading && data.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps} />
          <YAxis
            {...yAxisProps}
            yAxisId="bf"
            width={44}
            domain={["dataMin - 1", "dataMax + 1"]}
          />
          <YAxis
            {...yAxisProps}
            yAxisId="mm"
            orientation="right"
            width={44}
            domain={["dataMin - 1", "dataMax + 1"]}
          />
          <Tooltip {...tooltipProps} />
          <Legend {...legendProps} />
          <Line
            yAxisId="bf"
            dataKey="bodyFat"
            name="body fat %"
            stroke={CHART.c3}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            yAxisId="mm"
            dataKey="muscle"
            name="muscle (kg)"
            stroke={CHART.c1}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </TrendCard>
  );
}
