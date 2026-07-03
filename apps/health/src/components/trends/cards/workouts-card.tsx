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

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CHART,
  CHART_MARGIN,
  formatDayShort,
  gridProps,
  tooltipProps,
  xAxisProps,
  yAxisProps,
} from "@/components/trends/trend-card";
import { bucketWeekly } from "@/lib/aggregate";
import { useInView } from "@/lib/hooks/use-in-view";
import { useWorkouts } from "@/lib/hooks/use-workouts";

/** Seconds → "45m" / "1h05m"; "—" when unknown. */
function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}

// Apple Watch workout sessions: a recent-session list plus a weekly-minutes chart.
// Sits by Activity (both wearable signals), away from Intake. Per the domain
// guardrails, active-energy is shown only as a flagged estimate — never measured
// truth, never netted against intake.
export function WorkoutsCard({ days }: { days: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const workouts = useWorkouts(days, inView);
  const loading = !inView || workouts.isLoading;
  const recent = workouts.data?.recent ?? [];
  const weekly = bucketWeekly(workouts.data?.dailyMinutes ?? [], "sum");
  const empty = !loading && recent.length === 0;

  return (
    <Card ref={ref} className="gap-3 p-4">
      <div className="space-y-0.5">
        <h2 className="text-sm leading-tight font-semibold">
          Workouts — sessions (Apple Watch)
        </h2>
        <p className="text-muted-foreground text-xs">
          Weekly minutes · active-energy is a wearable estimate
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-[232px] w-full" />
      ) : empty ? (
        <div className="text-muted-foreground flex h-[232px] items-center justify-center text-sm">
          No workouts yet
        </div>
      ) : (
        <>
          <ul className="divide-border divide-y text-sm">
            {recent.map((w) => (
              <li
                key={w.id}
                className="flex items-baseline justify-between gap-3 py-1.5"
              >
                <div className="min-w-0">
                  <span className="font-medium">{w.type}</span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {formatDayShort(w.day)}
                  </span>
                  {w.distance != null || w.avgHeartRate != null ? (
                    <div className="text-muted-foreground text-xs">
                      {[
                        w.distance != null ? `${w.distance.toFixed(1)} km` : null,
                        w.avgHeartRate != null
                          ? `${w.avgHeartRate} bpm avg`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <div>{formatDuration(w.durationSeconds)}</div>
                  {w.activeEnergyKcal != null ? (
                    <div className="text-muted-foreground text-xs">
                      {Math.round(w.activeEnergyKcal)} kcal*
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          <div className="h-[140px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekly} margin={CHART_MARGIN}>
                <CartesianGrid {...gridProps} />
                <XAxis {...xAxisProps} dataKey="weekStart" />
                <YAxis {...yAxisProps} width={44} />
                <Tooltip
                  {...tooltipProps}
                  labelFormatter={(label: React.ReactNode) =>
                    `Week of ${formatDayShort(String(label))}`
                  }
                />
                <Bar
                  dataKey="value"
                  name="minutes"
                  fill={CHART.c2}
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <p className="text-muted-foreground text-[11px]">
            * active-energy is a wearable estimate, never a measured value or a
            calorie balance.
          </p>
        </>
      )}
    </Card>
  );
}
