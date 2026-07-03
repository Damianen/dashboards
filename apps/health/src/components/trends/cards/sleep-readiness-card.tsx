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

export function SleepReadinessCard({ days }: { days: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const sleep = useTrend("sleep_score", days, inView);
  const readiness = useTrend("readiness", days, inView);
  const loading = !inView || sleep.isLoading || readiness.isLoading;
  const data = mergeByDay({
    sleep: sleep.data ?? [],
    readiness: readiness.data ?? [],
  });

  return (
    <TrendCard
      innerRef={ref}
      title="Sleep & Readiness"
      subtitle="Oura scores"
      loading={loading}
      empty={!loading && data.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} domain={[0, 100]} />
          <Tooltip {...tooltipProps} />
          <Legend {...legendProps} />
          <Line
            dataKey="sleep"
            name="Sleep"
            stroke={CHART.c2}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            dataKey="readiness"
            name="Readiness"
            stroke={CHART.c4}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </TrendCard>
  );
}
