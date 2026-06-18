"use client";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** "YYYY-MM-DD" → "D/M" for compact axis ticks. Pure slice, no Date. */
export function formatDayShort(day: string): string {
  return `${Number(day.slice(8, 10))}/${Number(day.slice(5, 7))}`;
}

// recharts colour strings resolve to the theme tokens (see globals.css).
export const CHART = {
  c1: "var(--chart-1)",
  c2: "var(--chart-2)",
  c3: "var(--chart-3)",
  c4: "var(--chart-4)",
  c5: "var(--chart-5)",
  muted: "var(--muted-foreground)",
} as const;

export const CHART_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };

export const gridProps = {
  stroke: "var(--border)",
  strokeDasharray: "3 3",
  vertical: false,
} as const;

export const xAxisProps = {
  dataKey: "day",
  tickFormatter: (value: string | number) => formatDayShort(String(value)),
  tick: { fontSize: 10, fill: "var(--muted-foreground)" },
  tickLine: false,
  axisLine: false,
  minTickGap: 24,
  interval: "preserveStartEnd" as const,
};

export const yAxisProps = {
  tick: { fontSize: 10, fill: "var(--muted-foreground)" },
  tickLine: false,
  axisLine: false,
  width: 40,
};

export const tooltipProps = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--foreground)",
  },
  labelStyle: { color: "var(--muted-foreground)" },
  labelFormatter: (label: React.ReactNode) => formatDayShort(String(label)),
};

export const legendProps = {
  wrapperStyle: { fontSize: 11 },
  iconSize: 10,
};

/**
 * Card shell shared by every trends chart: header (title + optional subtitle),
 * a fixed-height plot area, and the loading / empty fallbacks. The plot stays a
 * constant 180px tall so a `ResponsiveContainer` child always has a sized parent
 * and the row never causes horizontal scroll at 390px.
 */
export function TrendCard({
  title,
  subtitle,
  loading,
  empty,
  emptyLabel = "No data yet",
  innerRef,
  children,
}: {
  title: string;
  subtitle?: string;
  loading: boolean;
  empty: boolean;
  emptyLabel?: string;
  innerRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}) {
  return (
    <Card ref={innerRef} className="gap-3 p-4">
      <div className="space-y-0.5">
        <h2 className="text-sm leading-tight font-semibold">{title}</h2>
        {subtitle ? (
          <p className="text-muted-foreground text-xs">{subtitle}</p>
        ) : null}
      </div>
      <div className="h-[180px] w-full">
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : empty ? (
          <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
            {emptyLabel}
          </div>
        ) : (
          children
        )}
      </div>
    </Card>
  );
}
