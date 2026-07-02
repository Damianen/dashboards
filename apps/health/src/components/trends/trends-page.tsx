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
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { TdeeCard } from "@/components/trends/tdee-card";
import { bucketWeekly, mergeByDay } from "@/lib/aggregate";
import { useE1rm } from "@/lib/hooks/use-e1rm";
import { useExercises } from "@/lib/hooks/use-exercises";
import { useInView } from "@/lib/hooks/use-in-view";
import { useMuscleVolume } from "@/lib/hooks/use-muscle-volume";
import { useTrend } from "@/lib/hooks/use-trend";
import { useWeightGoal, type WeightGoalResult } from "@/lib/hooks/use-weight-goal";
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
        <BodyCompositionCard days={days} />
        {/* Self-contained: its own 14/21/28 window, independent of the page range. */}
        <TdeeCard />
        <SleepReadinessCard days={days} />
        <SleepDurationCard days={days} />
        <RecoveryTrendCard days={days} />
        <ActivityCard days={days} />
        <WorkoutsCard days={days} />
        <WaterCard days={days} />
        <CaffeineCard days={days} />
        <IntakeCard days={days} />
        <LiftingCard days={days} />
        <E1rmCard days={days} />
        <MuscleVolumeCard days={days} />
      </div>
    </div>
  );
}

// Default subtitle plus, when a goal is set, a plain-language projection from the
// measured trend (or an honest "not trending toward it" when the slope says so).
function weightSubtitle(g?: WeightGoalResult): string {
  const base = "Daily · 7-day average (the signal)";
  if (!g || g.goalKg == null) return base;
  if (g.onTrack && g.weeksToGoal != null) {
    if (g.weeksToGoal <= 0) return `Goal ${g.goalKg} kg · reached`;
    const wks = Math.round(g.weeksToGoal);
    return `Goal ${g.goalKg} kg · ~${wks} wk${wks === 1 ? "" : "s"}${
      g.etaDay ? ` (≈ ${g.etaDay})` : ""
    }`;
  }
  return `Goal ${g.goalKg} kg · not trending toward it`;
}

function WeightCard({ days }: { days: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const weight = useTrend("weight", days, inView);
  const avg = useTrend("weight_7d_avg", days, inView);
  const goal = useWeightGoal(inView);
  const loading = !inView || weight.isLoading || avg.isLoading;
  const data = mergeByDay({ weight: weight.data ?? [], avg: avg.data ?? [] });
  const goalKg = goal.data?.goalKg ?? null;

  return (
    <TrendCard
      innerRef={ref}
      title="Weight"
      subtitle={weightSubtitle(goal.data)}
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
          {goalKg != null ? (
            <ReferenceLine
              y={goalKg}
              stroke={CHART.c3}
              strokeDasharray="5 3"
              strokeWidth={1.5}
              label={{
                value: "goal",
                position: "insideTopRight",
                fontSize: 10,
                fill: "var(--muted-foreground)",
              }}
            />
          ) : null}
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

// Body fat % and muscle mass (Withings) — synced but previously never charted.
// Dual axis: the two metrics live on very different scales.
function BodyCompositionCard({ days }: { days: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const bodyFat = useTrend("body_fat_pct", days, inView);
  const muscle = useTrend("muscle_mass_kg", days, inView);
  const loading = !inView || bodyFat.isLoading || muscle.isLoading;
  const data = mergeByDay({
    bodyFat: bodyFat.data ?? [],
    muscle: muscle.data ?? [],
  });

  return (
    <TrendCard
      innerRef={ref}
      title="Body composition"
      subtitle="Body fat % · muscle mass (kg) — Withings"
      loading={loading}
      empty={!loading && data.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps} />
          <YAxis
            {...yAxisProps}
            yAxisId="bf"
            width={44}
            domain={["dataMin - 1", "dataMax + 1"]}
          />
          <YAxis
            {...yAxisProps}
            yAxisId="mm"
            orientation="right"
            width={44}
            domain={["dataMin - 1", "dataMax + 1"]}
          />
          <Tooltip {...tooltipProps} />
          <Legend {...legendProps} />
          <Line
            yAxisId="bf"
            dataKey="bodyFat"
            name="body fat %"
            stroke={CHART.c3}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            yAxisId="mm"
            dataKey="muscle"
            name="muscle (kg)"
            stroke={CHART.c1}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
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

// Sleep duration + depth (Oura). total_sleep_min was already in the view but never
// charted; deep/REM are newly surfaced. Minutes on one axis.
function SleepDurationCard({ days }: { days: number }) {
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

// Recovery signals from sleep sessions (HRV averaged, resting HR as the night's
// lowest) — promoted from the Today sparklines to a full trend. Dual axis: HRV (ms)
// and resting HR (bpm) sit on different scales.
function RecoveryTrendCard({ days }: { days: number }) {
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
      subtitle="Daily intake · per-day target (varies with caffeine load)"
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
      subtitle="Daily total — all sources (mg)"
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

// Estimated-1RM strength progression for ONE exercise (picked via the selector),
// putting heavy-low-rep and lighter-high-rep working sets on one comparable scale.
// PRs (all-time e1RM highs) are overlaid as scatter points. e1RM is a TREND estimate,
// never a tested max. Custom Card (not TrendCard) so the picker stays visible when empty.
function E1rmCard({ days }: { days: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const exercises = useExercises();
  const [picked, setPicked] = useState<string | null>(null);
  const list = exercises.data ?? [];
  // Default to the first catalog exercise until the user picks one.
  const selected = picked ?? list[0]?.name ?? null;
  const e1rm = useE1rm(selected, days, inView);
  const loading =
    !inView || e1rm.isLoading || (exercises.isLoading && selected === null);
  const points =
    e1rm.data?.map((p) => ({
      day: p.day,
      e1rm: p.e1rmKg,
      // Non-null only on PR days → Scatter renders a marker just there.
      pr: p.isPr ? p.e1rmKg : null,
      // Mean RPE of the day's rated sets; unrated days stay honest gaps.
      rpe: p.avgRpe,
    })) ?? [];
  const empty = !loading && (selected === null || points.length === 0);

  return (
    <Card ref={ref} className="gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-sm leading-tight font-semibold">
            Exercise strength (e1RM)
          </h2>
          <p className="text-muted-foreground text-xs">
            Best est. 1-rep-max per day · ◆ = PR · avg RPE — a trend, not a
            tested max
          </p>
        </div>
        <Select value={selected ?? undefined} onValueChange={setPicked}>
          <SelectTrigger className="h-8 w-36 shrink-0 text-xs">
            <SelectValue placeholder="Exercise" />
          </SelectTrigger>
          <SelectContent>
            {list.map((ex) => (
              <SelectItem key={ex.id} value={ex.name}>
                {ex.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="h-[180px] w-full">
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : empty ? (
          <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
            {selected === null
              ? "No exercises yet"
              : "No working sets for this exercise yet"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={CHART_MARGIN}>
              <CartesianGrid {...gridProps} />
              <XAxis {...xAxisProps} />
              <YAxis
                {...yAxisProps}
                yAxisId="e1rm"
                width={44}
                domain={["dataMin - 2", "dataMax + 2"]}
              />
              <YAxis
                {...yAxisProps}
                yAxisId="rpe"
                orientation="right"
                width={28}
                domain={[1, 10]}
              />
              <Tooltip {...tooltipProps} />
              <Legend {...legendProps} />
              <Line
                yAxisId="e1rm"
                dataKey="e1rm"
                name="e1RM (kg)"
                stroke={CHART.c1}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Scatter yAxisId="e1rm" dataKey="pr" name="PR" fill={CHART.c4} />
              <Line
                yAxisId="rpe"
                dataKey="rpe"
                name="avg RPE"
                stroke={CHART.c3}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

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
function MuscleVolumeCard({ days }: { days: number }) {
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
