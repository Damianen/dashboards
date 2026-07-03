"use client";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { dayLabelShort, formatHm, formatKg, formatNumber } from "@/lib/format";
import {
  useWeeklyReview,
  type WeeklyReviewResult,
} from "@/lib/hooks/use-weekly-review";
import { cn } from "@/lib/utils";
import type { Callout, WeekAggregates } from "@/lib/weekly-review";

/** Millilitres → litres with one decimal (lib/notifications' formatLiters is server-side). */
function liters(ml: number): string {
  return `${(ml / 1000).toFixed(1)} L`;
}

/**
 * How a delta is judged. Only sleep and readiness carry a good direction
 * (higher = better). Everything else — weight above all — renders NEUTRAL: the
 * signed change without a color verdict (weight down isn't "good", more volume
 * isn't automatically "better"; the app reports, it doesn't judge — CLAUDE.md).
 */
type Judgement = "higher-better" | "neutral";

function DeltaChip({
  delta,
  judgement = "neutral",
  format,
}: {
  delta: number | null;
  judgement?: Judgement;
  /** Formats the |delta| magnitude (the chip adds arrow and sign). */
  format: (value: number) => string;
}) {
  if (delta == null) {
    return (
      <span className="text-muted-foreground text-xs tabular-nums" aria-label="No comparison">
        —
      </span>
    );
  }
  const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "";
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
  const color =
    judgement === "neutral" || delta === 0
      ? "text-muted-foreground"
      : (delta > 0) === (judgement === "higher-better")
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-red-600 dark:text-red-400";
  return (
    <span className={cn("shrink-0 text-xs font-medium tabular-nums", color)}>
      {arrow} {sign}
      {format(Math.abs(delta))}
    </span>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function MetricRow({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="font-medium tabular-nums">{value}</span>
        {delta}
      </span>
    </div>
  );
}

/** "Best night: Thu 2 Jul — 91" under the section its metric belongs to. */
function CalloutLine({
  prefix,
  callout,
  format,
}: {
  prefix: string;
  callout: Callout | null;
  format: (value: number) => string;
}) {
  if (callout == null) return null;
  return (
    <p className="text-muted-foreground text-xs">
      {prefix}: {dayLabelShort(callout.day)} — {format(callout.value)}
    </p>
  );
}

/** True when nothing reviewable exists for the week (the all-null/zero shape). */
function weekHasNoData(week: WeekAggregates): boolean {
  return (
    week.training.volumeKg == null &&
    week.training.workingSets == null &&
    (week.training.trainingDays ?? 0) === 0 &&
    week.sleep.avgScore == null &&
    week.sleep.avgDurationMin == null &&
    week.readiness.avgScore == null &&
    week.weight.lastWeight7dAvg == null &&
    week.intake.avgKcal == null &&
    (week.intake.daysLogged ?? 0) === 0 &&
    (week.water.totalMl ?? 0) === 0 &&
    (week.water.daysMetTarget ?? 0) === 0 &&
    week.consistency.foodLoggedDays === 0 &&
    week.consistency.supplementCompleteDays === 0
  );
}

const kg = (v: number) => `${formatNumber(v)} kg`;
const int = (v: number) => formatNumber(v);
const oneDec = (v: number) => formatNumber(v, 1);
const kcal = (v: number) => `${formatNumber(v)} kcal`;
const grams = (v: number) => `${formatNumber(v)} g`;
const minutes = (v: number) => `${formatNumber(v)} min`;
const days = (v: number) => `${formatNumber(v)}d`;

/**
 * The weekly review: the chosen week's per-domain aggregates, each with a
 * week-over-week delta chip ("—" when either week lacks the metric). Values are
 * independent honest metrics — intake and expenditure never netted, no
 * active_kcal anywhere (CLAUDE.md).
 */
export function WeeklyReviewCard({ weekStart }: { weekStart?: string }) {
  const { data, isLoading, isError } = useWeeklyReview(weekStart);

  if (isLoading) {
    return (
      <Card className="gap-3 p-4">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </Card>
    );
  }
  if (isError || !data) {
    return (
      <Card className="gap-3 p-4">
        <p className="text-muted-foreground py-4 text-sm">
          Couldn&apos;t load the weekly review.
        </p>
      </Card>
    );
  }
  if (weekHasNoData(data.current)) {
    return (
      <Card className="gap-3 p-4">
        <p className="text-muted-foreground py-4 text-sm">
          {data.isCurrentWeek
            ? "Nothing logged or synced yet this week — the review fills in as data lands."
            : "No data for this week."}
        </p>
      </Card>
    );
  }
  return <ReviewBody data={data} />;
}

function ReviewBody({ data }: { data: WeeklyReviewResult }) {
  const { current: c, deltas: d, callouts } = data;
  const elapsed = c.water.daysElapsed;
  const val = (v: number | null, format: (n: number) => string) =>
    v == null ? "—" : format(v);
  const outOfElapsed = (v: number | null) =>
    v == null ? "—" : `${formatNumber(v)}/${elapsed} days`;

  return (
    <Card className="gap-4 p-4">
      <p className="text-muted-foreground text-xs">
        {data.isCurrentWeek
          ? `Week so far (${elapsed} of 7 days) vs all of last week`
          : "Against the week before"}
      </p>

      <Section title="Training">
        <MetricRow
          label="Volume"
          value={val(c.training.volumeKg, kg)}
          delta={<DeltaChip delta={d.training.volumeKg} format={kg} />}
        />
        <MetricRow
          label="Working sets"
          value={val(c.training.workingSets, int)}
          delta={<DeltaChip delta={d.training.workingSets} format={int} />}
        />
        <MetricRow
          label="Days trained"
          value={val(c.training.trainingDays, int)}
          delta={<DeltaChip delta={d.training.trainingDays} format={int} />}
        />
        <CalloutLine
          prefix="Biggest session"
          callout={callouts.biggestVolumeDay}
          format={kg}
        />
      </Section>

      <Section title="Sleep">
        <MetricRow
          label="Avg score"
          value={val(c.sleep.avgScore, int)}
          delta={
            <DeltaChip
              delta={d.sleep.avgScore}
              judgement="higher-better"
              format={oneDec}
            />
          }
        />
        <MetricRow
          label="Avg duration"
          value={val(c.sleep.avgDurationMin, formatHm)}
          delta={
            <DeltaChip
              delta={d.sleep.avgDurationMin}
              judgement="higher-better"
              format={minutes}
            />
          }
        />
        <CalloutLine
          prefix="Best night"
          callout={callouts.bestSleepDay}
          format={int}
        />
      </Section>

      <Section title="Readiness">
        <MetricRow
          label="Avg score"
          value={val(c.readiness.avgScore, int)}
          delta={
            <DeltaChip
              delta={d.readiness.avgScore}
              judgement="higher-better"
              format={oneDec}
            />
          }
        />
        <CalloutLine
          prefix="Toughest day"
          callout={callouts.worstReadinessDay}
          format={int}
        />
      </Section>

      <Section title="Weight">
        {/* Deliberately neutral: the signed change only, no good/bad color. */}
        <MetricRow
          label="7-day avg"
          value={val(c.weight.lastWeight7dAvg, formatKg)}
          delta={
            <DeltaChip
              delta={d.weight.lastWeight7dAvg}
              format={(v) => `${formatNumber(v, 1)} kg`}
            />
          }
        />
      </Section>

      <Section title="Intake">
        <MetricRow
          label="Avg calories"
          value={val(c.intake.avgKcal, kcal)}
          delta={<DeltaChip delta={d.intake.avgKcal} format={kcal} />}
        />
        <MetricRow
          label="Avg protein"
          value={val(c.intake.avgProteinG, grams)}
          delta={<DeltaChip delta={d.intake.avgProteinG} format={grams} />}
        />
        <MetricRow
          label="Avg fiber"
          value={val(c.intake.avgFiberG, grams)}
          delta={<DeltaChip delta={d.intake.avgFiberG} format={grams} />}
        />
        <MetricRow
          label="Days logged"
          value={outOfElapsed(c.intake.daysLogged)}
          delta={<DeltaChip delta={d.intake.daysLogged} format={days} />}
        />
        {(c.intake.kcalTarget != null || c.intake.proteinTargetG != null) && (
          <p className="text-muted-foreground text-xs">
            Standing targets:{" "}
            {[
              c.intake.kcalTarget != null
                ? `${formatNumber(c.intake.kcalTarget)} kcal`
                : null,
              c.intake.proteinTargetG != null
                ? `${formatNumber(c.intake.proteinTargetG)} g protein`
                : null,
            ]
              .filter((part) => part != null)
              .join(" · ")}
          </p>
        )}
      </Section>

      <Section title="Water">
        <MetricRow
          label="Target met"
          value={outOfElapsed(c.water.daysMetTarget)}
          delta={<DeltaChip delta={d.water.daysMetTarget} format={days} />}
        />
        <MetricRow
          label="Total"
          value={val(c.water.totalMl, liters)}
          delta={<DeltaChip delta={d.water.totalMl} format={liters} />}
        />
      </Section>

      <Section title="Consistency">
        <MetricRow
          label="Food logged"
          value={`${formatNumber(c.consistency.foodLoggedDays)}/${elapsed} days`}
          delta={<DeltaChip delta={d.consistency.foodLoggedDays} format={days} />}
        />
        <MetricRow
          label="Supplements complete"
          value={`${formatNumber(c.consistency.supplementCompleteDays)}/${elapsed} days`}
          delta={
            <DeltaChip delta={d.consistency.supplementCompleteDays} format={days} />
          }
        />
      </Section>

      <p className="text-muted-foreground border-t pt-3 text-xs">
        Week-over-week changes on independent metrics — intake and expenditure
        are never netted. A &ldquo;—&rdquo; means one of the weeks has no data
        for that metric.
      </p>
    </Card>
  );
}
