"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import { bucketWeekly, mergeByDay } from "@/lib/aggregate";
import { useInView } from "@/lib/hooks/use-in-view";
import { useTrend } from "@/lib/hooks/use-trend";
import { useWorkouts } from "@/lib/hooks/use-workouts";

const RANGES = [30, 90, 365] as const;
type Range = (typeof RANGES)[number];

export function TrendsPage() {
  const [days, setDays] = useState<Range>(30);

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <h1 className="text-xl font-semibold">Trends</h1>
        <div role="tablist" aria-label="Time range" className="flex gap-2">
          {RANGES.map((r) => (
            <Button
              key={r}
              role="tab"
              aria-selected={r === days}
              variant={r === days ? "default" : "outline"}
              className="h-11 flex-1"
              onClick={() => setDays(r)}
            >
              {r} days
            </Button>
          ))}
        </div>
      </header>

      {/* Order is guardrail-driven: device "Activity" sits well apart from
          "Intake" and uses a muted palette — device kcal is never adjacent to,
          nor sharing an axis/card with, intake kcal. */}
      <div className="space-y-4">
        <WeightCard days={days} />
        <SleepReadinessCard days={days} />
        <ActivityCard days={days} />
        <WorkoutsCard days={days} />
        <WaterCard days={days} />
        <CaffeineCard days={days} />
        <IntakeCard days={days} />
        <LiftingCard days={days} />
      </div>
    </div>
  );
}

function WeightCard({ days }: { days: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const weight = useTrend("weight", days, inView);
  const avg = useTrend("weight_7d_avg", days, inView);
  const loading = !inView || weight.isLoading || avg.isLoading;
  const data = mergeByDay({ weight: weight.data ?? [], avg: avg.data ?? [] });

  return (
    <TrendCard
      innerRef={ref}
      title="Weight"
      subtitle="Daily · 7-day average (the signal)"
      loading={loading}
      empty={!loading && data.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps} />
          <YAxis
            {...yAxisProps}
            width={44}
            domain={["dataMin - 1", "dataMax + 1"]}
          />
          <Tooltip {...tooltipProps} />
          <Scatter dataKey="weight" name="weight" fill={CHART.muted} />
          <Line
            dataKey="avg"
            name="7-day avg"
            stroke={CHART.c1}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </TrendCard>
  );
}

function SleepReadinessCard({ days }: { days: number }) {
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

function ActivityCard({ days }: { days: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const steps = useTrend("steps", days, inView);
  const active = useTrend("active_kcal", days, inView);
  const loading = !inView || steps.isLoading || active.isLoading;
  const data = mergeByDay({
    steps: steps.data ?? [],
    active: active.data ?? [],
  });

  return (
    <TrendCard
      innerRef={ref}
      title="Activity — trend (wearable estimate)"
      subtitle="Steps · active kcal — wrist EE is a relative trend, not a truth"
      loading={loading}
      empty={!loading && data.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} yAxisId="steps" width={44} />
          <YAxis
            {...yAxisProps}
            yAxisId="kcal"
            orientation="right"
            width={44}
          />
          <Tooltip {...tooltipProps} />
          <Legend {...legendProps} />
          <Bar
            yAxisId="steps"
            dataKey="steps"
            name="steps"
            fill={CHART.muted}
            fillOpacity={0.35}
            radius={[2, 2, 0, 0]}
          />
          <Line
            yAxisId="kcal"
            dataKey="active"
            name="active kcal — trend (wearable estimate)"
            stroke={CHART.muted}
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

function WaterCard({ days }: { days: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const water = useTrend("water_ml", days, inView);
  const target = useTrend("water_target_ml", days, inView);
  const loading = !inView || water.isLoading || target.isLoading;
  const data = mergeByDay({
    water: water.data ?? [],
    target: target.data ?? [],
  });

  return (
    <TrendCard
      innerRef={ref}
      title="Water"
      subtitle="Daily intake · per-day target (varies with stimulant load)"
      loading={loading}
      empty={!loading && (water.data ?? []).length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} width={48} />
          <Tooltip {...tooltipProps} />
          <Legend {...legendProps} />
          <Bar
            dataKey="water"
            name="water (ml)"
            fill={CHART.c1}
            radius={[2, 2, 0, 0]}
          />
          <Line
            dataKey="target"
            name="target (ml)"
            stroke={CHART.c3}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </TrendCard>
  );
}

function CaffeineCard({ days }: { days: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const caffeine = useTrend("caffeine_mg", days, inView);
  const loading = !inView || caffeine.isLoading;
  const data = caffeine.data ?? [];

  return (
    <TrendCard
      innerRef={ref}
      title="Caffeine"
      subtitle="Daily (mg)"
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

function IntakeCard({ days }: { days: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const kcal = useTrend("intake_kcal", days, inView);
  const protein = useTrend("protein_g", days, inView);
  const loading = !inView || kcal.isLoading || protein.isLoading;
  const data = mergeByDay({
    kcal: kcal.data ?? [],
    protein: protein.data ?? [],
  });

  return (
    <TrendCard
      innerRef={ref}
      title="Intake"
      subtitle="Logged kcal · protein"
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
        </ComposedChart>
      </ResponsiveContainer>
    </TrendCard>
  );
}

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
function WorkoutsCard({ days }: { days: number }) {
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

function LiftingCard({ days }: { days: number }) {
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
