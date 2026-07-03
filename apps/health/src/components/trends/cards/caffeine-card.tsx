"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
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
import { useInView } from "@/lib/hooks/use-in-view";
import { useTrend } from "@/lib/hooks/use-trend";

export function CaffeineCard({ days }: { days: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const caffeine = useTrend("caffeine_mg", days, inView);
  const loading = !inView || caffeine.isLoading;
  const data = caffeine.data ?? [];

  return (
    <TrendCard
      innerRef={ref}
      title="Caffeine"
      subtitle="Daily total — all sources (mg)"
      loading={loading}
      empty={!loading && data.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} />
          <Tooltip {...tooltipProps} />
          <Bar
            dataKey="value"
            name="caffeine (mg)"
            fill={CHART.c5}
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </TrendCard>
  );
}
