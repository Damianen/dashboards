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

// Recovery signals from sleep sessions (HRV averaged, resting HR as the night's
// lowest) — promoted from the Today sparklines to a full trend. Dual axis: HRV (ms)
// and resting HR (bpm) sit on different scales.
export function RecoveryTrendCard({ days }: { days: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const hrv = useTrend("hrv_ms", days, inView);
  const rhr = useTrend("resting_hr_bpm", days, inView);
  const loading = !inView || hrv.isLoading || rhr.isLoading;
  const data = mergeByDay({ hrv: hrv.data ?? [], rhr: rhr.data ?? [] });

  return (
    <TrendCard
      innerRef={ref}
      title="Recovery — HRV & resting HR"
      subtitle="Night HRV (ms) · resting HR (bpm) — from sleep"
      loading={loading}
      empty={!loading && data.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps} />
          <YAxis
            {...yAxisProps}
            yAxisId="hrv"
            width={44}
            domain={["dataMin - 5", "dataMax + 5"]}
          />
          <YAxis
            {...yAxisProps}
            yAxisId="rhr"
            orientation="right"
            width={44}
            domain={["dataMin - 3", "dataMax + 3"]}
          />
          <Tooltip {...tooltipProps} />
          <Legend {...legendProps} />
          <Line
            yAxisId="hrv"
            dataKey="hrv"
            name="HRV (ms)"
            stroke={CHART.c2}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            yAxisId="rhr"
            dataKey="rhr"
            name="resting HR (bpm)"
            stroke={CHART.c5}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </TrendCard>
  );
}
