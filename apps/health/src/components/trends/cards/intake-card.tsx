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

export function IntakeCard({ days }: { days: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const kcal = useTrend("intake_kcal", days, inView);
  const protein = useTrend("protein_g", days, inView);
  const fiber = useTrend("fiber_g", days, inView);
  const loading =
    !inView || kcal.isLoading || protein.isLoading || fiber.isLoading;
  const data = mergeByDay({
    kcal: kcal.data ?? [],
    protein: protein.data ?? [],
    fiber: fiber.data ?? [],
  });

  return (
    <TrendCard
      innerRef={ref}
      title="Intake"
      subtitle="Logged kcal · protein · fiber"
      loading={loading}
      empty={!loading && data.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} yAxisId="kcal" width={48} />
          <YAxis
            {...yAxisProps}
            yAxisId="protein"
            orientation="right"
          />
          <Tooltip {...tooltipProps} />
          <Legend {...legendProps} />
          <Bar
            yAxisId="kcal"
            dataKey="kcal"
            name="kcal"
            fill={CHART.c1}
            radius={[2, 2, 0, 0]}
          />
          <Line
            yAxisId="protein"
            dataKey="protein"
            name="protein (g)"
            stroke={CHART.c2}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            yAxisId="protein"
            dataKey="fiber"
            name="fiber (g)"
            stroke={CHART.c3}
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
