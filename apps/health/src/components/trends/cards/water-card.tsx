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

export function WaterCard({ days }: { days: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const water = useTrend("water_ml", days, inView);
  const target = useTrend("water_target_ml", days, inView);
  const loading = !inView || water.isLoading || target.isLoading;
  const data = mergeByDay({
    water: water.data ?? [],
    target: target.data ?? [],
  });

  return (
    <TrendCard
      innerRef={ref}
      title="Water"
      subtitle="Daily intake · per-day target (varies with caffeine load)"
      loading={loading}
      empty={!loading && (water.data ?? []).length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} width={48} />
          <Tooltip {...tooltipProps} />
          <Legend {...legendProps} />
          <Bar
            dataKey="water"
            name="water (ml)"
            fill={CHART.c1}
            radius={[2, 2, 0, 0]}
          />
          <Line
            dataKey="target"
            name="target (ml)"
            stroke={CHART.c3}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </TrendCard>
  );
}
