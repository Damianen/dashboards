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

// Sleep duration + depth (Oura). total_sleep_min was already in the view but never
// charted; deep/REM are newly surfaced. Minutes on one axis.
export function SleepDurationCard({ days }: { days: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const total = useTrend("total_sleep_min", days, inView);
  const deep = useTrend("deep_min", days, inView);
  const rem = useTrend("rem_min", days, inView);
  const loading = !inView || total.isLoading || deep.isLoading || rem.isLoading;
  const data = mergeByDay({
    total: total.data ?? [],
    deep: deep.data ?? [],
    rem: rem.data ?? [],
  });

  return (
    <TrendCard
      innerRef={ref}
      title="Sleep duration & depth"
      subtitle="Total · deep · REM minutes (Oura)"
      loading={loading}
      empty={!loading && data.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} width={44} />
          <Tooltip {...tooltipProps} />
          <Legend {...legendProps} />
          <Line
            dataKey="total"
            name="total (min)"
            stroke={CHART.c2}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            dataKey="deep"
            name="deep (min)"
            stroke={CHART.c4}
            strokeWidth={1.5}
            dot={false}
            connectNulls
          />
          <Line
            dataKey="rem"
            name="REM (min)"
            stroke={CHART.c1}
            strokeWidth={1.5}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </TrendCard>
  );
}
