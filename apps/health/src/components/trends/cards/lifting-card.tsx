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
  formatDayShort,
  gridProps,
  TrendCard,
  tooltipProps,
  xAxisProps,
  yAxisProps,
} from "@/components/trends/trend-card";
import { bucketWeekly } from "@/lib/aggregate";
import { useInView } from "@/lib/hooks/use-in-view";
import { useTrend } from "@/lib/hooks/use-trend";

export function LiftingCard({ days }: { days: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const lifting = useTrend("lifting_volume_kg", days, inView);
  const loading = !inView || lifting.isLoading;
  const data = bucketWeekly(lifting.data ?? [], "sum");

  return (
    <TrendCard
      innerRef={ref}
      title="Lifting"
      subtitle="Weekly volume (kg)"
      loading={loading}
      empty={!loading && data.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps} dataKey="weekStart" />
          <YAxis {...yAxisProps} width={48} />
          <Tooltip
            {...tooltipProps}
            labelFormatter={(label: React.ReactNode) =>
              `Week of ${formatDayShort(String(label))}`
            }
          />
          <Bar
            dataKey="value"
            name="volume (kg)"
            fill={CHART.c4}
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </TrendCard>
  );
}
