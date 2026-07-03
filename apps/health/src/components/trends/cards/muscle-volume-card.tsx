"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
  legendProps,
  TrendCard,
  tooltipProps,
  xAxisProps,
  yAxisProps,
} from "@/components/trends/trend-card";
import { useInView } from "@/lib/hooks/use-in-view";
import { useMuscleVolume } from "@/lib/hooks/use-muscle-volume";

// One distinct colour per muscle group, cycled if there are more groups than colours.
const GROUP_PALETTE = [
  CHART.c1,
  CHART.c2,
  CHART.c3,
  CHART.c4,
  CHART.c5,
  CHART.muted,
] as const;

// Weekly hard sets (working sets) per muscle group — the key training-balance/volume
// metric — as a stacked bar. Groups are dynamic (from the exercise muscleGroup tags),
// so the bars are generated from the returned `groups` list.
export function MuscleVolumeCard({ days }: { days: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const weeks = Math.min(52, Math.ceil(days / 7));
  const vol = useMuscleVolume(weeks, inView);
  const loading = !inView || vol.isLoading;
  const groups = vol.data?.groups ?? [];
  const data = vol.data?.weeks ?? [];

  return (
    <TrendCard
      innerRef={ref}
      title="Weekly sets per muscle group"
      subtitle="Hard sets (working sets) per week — training balance & volume"
      loading={loading}
      empty={!loading && data.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps} dataKey="weekStart" />
          <YAxis {...yAxisProps} width={36} />
          <Tooltip
            {...tooltipProps}
            labelFormatter={(label: React.ReactNode) =>
              `Week of ${formatDayShort(String(label))}`
            }
          />
          <Legend {...legendProps} />
          {groups.map((g, i) => (
            <Bar
              key={g}
              dataKey={g}
              stackId="mg"
              name={g}
              fill={GROUP_PALETTE[i % GROUP_PALETTE.length]}
              radius={
                i === groups.length - 1
                  ? ([2, 2, 0, 0] as [number, number, number, number])
                  : undefined
              }
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </TrendCard>
  );
}
