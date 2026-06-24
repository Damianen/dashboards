"use client";

import { HeartPulse } from "lucide-react";
import {
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState, MetricCard } from "@/components/today/metric-card";
import { Badge } from "@/components/ui/badge";
import type { MetricRecovery, RecoveryResult } from "@/lib/hooks/use-recovery";
import type { Flag, RecoveryStatus } from "@/lib/recovery";
import { cn } from "@/lib/utils";

const METRIC_ORDER = ["restingHr", "hrv", "tempDeviation"] as const;

const STATUS_META: Record<RecoveryStatus, { label: string; className: string }> = {
  normal: {
    label: "On baseline",
    className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  elevated: {
    label: "Slightly off baseline",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  high: {
    label: "Possible under-recovery",
    className: "bg-red-500/15 text-red-600 dark:text-red-400",
  },
  insufficient: {
    label: "Not enough data",
    className: "bg-muted text-muted-foreground",
  },
};

const FLAG_DOT: Record<Flag, string> = {
  none: "bg-emerald-500",
  elevated: "bg-amber-500",
  high: "bg-red-500",
  insufficient: "bg-muted-foreground/40",
};

function lineColor(flag: Flag): string {
  if (flag === "high") return "#ef4444"; // red-500
  if (flag === "elevated") return "#f59e0b"; // amber-500
  return "var(--muted-foreground)";
}

/** Today's value (and baseline mean) for a metric, formatted per unit. */
function fmtValue(value: number | null, unit: string): string {
  if (value == null) return "—";
  if (unit === "°C") {
    return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)} °C`;
  }
  return `${Math.round(value)} ${unit}`;
}

/** A tiny baseline-band sparkline: shaded mean ± sd, the line coloured by the day's flag. */
function Sparkline({ metric }: { metric: MetricRecovery }) {
  const { series, baseline, flag } = metric;
  const values = series
    .map((p) => p.value)
    .filter((v): v is number => v != null);
  if (values.length === 0) return <div className="h-10" aria-hidden />;

  const bounds = [...values];
  if (baseline) bounds.push(baseline.mean - baseline.sd, baseline.mean + baseline.sd);
  const lo = Math.min(...bounds);
  const hi = Math.max(...bounds);
  const pad = (hi - lo || 1) * 0.1;

  return (
    <div className="h-10 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <XAxis dataKey="day" hide />
          <YAxis hide domain={[lo - pad, hi + pad]} />
          {baseline ? (
            <ReferenceArea
              y1={baseline.mean - baseline.sd}
              y2={baseline.mean + baseline.sd}
              fill="var(--muted-foreground)"
              fillOpacity={0.12}
              stroke="none"
            />
          ) : null}
          {baseline ? (
            <ReferenceLine
              y={baseline.mean}
              stroke="var(--muted-foreground)"
              strokeDasharray="2 2"
              strokeOpacity={0.5}
            />
          ) : null}
          <Line
            dataKey="value"
            stroke={lineColor(flag)}
            strokeWidth={1.75}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Recovery trend from Oura: resting HR, HRV and body-temperature deviation each vs a rolling
 * baseline band, with an overall status chip. A gentle under-recovery / illness early-warning —
 * a TREND SIGNAL, never a diagnosis (the caveat is shown verbatim, CLAUDE.md). With too little
 * Oura history to form a baseline the card shows an empty state, never a guess.
 */
export function RecoveryCard({ r }: { r: RecoveryResult | null }) {
  return (
    <MetricCard title="Recovery" icon={HeartPulse}>
      {r == null || r.status === "insufficient" ? (
        <EmptyState>Not enough Oura history yet for a recovery baseline.</EmptyState>
      ) : (
        <div className="space-y-3">
          <Badge variant="outline" className={cn("border-transparent", STATUS_META[r.status].className)}>
            {STATUS_META[r.status].label}
          </Badge>

          <div className="space-y-3">
            {METRIC_ORDER.map((key) => {
              const m = r.metrics[key];
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn("size-2 rounded-full", FLAG_DOT[m.flag])}
                        aria-hidden
                      />
                      {m.label}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      <span className="text-foreground font-medium">
                        {fmtValue(m.today, m.unit)}
                      </span>
                      {m.baseline ? ` · ~${fmtValue(m.baseline.mean, m.unit)}` : ""}
                    </span>
                  </div>
                  <Sparkline metric={m} />
                </div>
              );
            })}
          </div>

          <p className="text-muted-foreground text-xs">{r.caveat}</p>
        </div>
      )}
    </MetricCard>
  );
}
