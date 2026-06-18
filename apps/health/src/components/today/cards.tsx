import {
  Apple,
  Droplets,
  Dumbbell,
  Footprints,
  Moon,
  Scale,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  EmptyState,
  MetricCard,
  Progress,
  Stat,
} from "@/components/today/metric-card";
import { clampPercent, formatHm, formatKg, formatNumber } from "@/lib/format";
import type { DailySummary } from "@/lib/hooks/use-summary";

type Props = { s: DailySummary | null };

export function WaterCard({ s }: Props) {
  const target = s?.waterTargetMl ?? null;
  const water = s?.waterMl ?? 0;
  return (
    <MetricCard title="Water" icon={Droplets}>
      {target == null ? (
        <EmptyState>No water target yet.</EmptyState>
      ) : (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-semibold tabular-nums">
              {formatNumber(water)}
              <span className="text-muted-foreground text-base font-normal">
                {" "}
                / {formatNumber(target)} ml
              </span>
            </span>
            <span className="text-muted-foreground text-xs">
              {formatNumber(Math.max(0, target - water))} ml to go
            </span>
          </div>
          <Progress percent={clampPercent(water, target)} />
        </div>
      )}
    </MetricCard>
  );
}

export function SleepCard({ s }: Props) {
  const has =
    s != null &&
    (s.sleepScore != null ||
      s.readinessScore != null ||
      s.totalSleepMin != null);
  return (
    <MetricCard title="Sleep & readiness" icon={Moon}>
      {!has ? (
        <EmptyState>No sleep data yet.</EmptyState>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Stat
            value={s?.sleepScore != null ? formatNumber(s.sleepScore) : "—"}
            label="Sleep score"
          />
          <Stat
            value={
              s?.readinessScore != null ? formatNumber(s.readinessScore) : "—"
            }
            label="Readiness"
          />
          <Stat
            value={s?.totalSleepMin != null ? formatHm(s.totalSleepMin) : "—"}
            label="Time asleep"
          />
        </div>
      )}
    </MetricCard>
  );
}

export function WeightCard({ s }: Props) {
  return (
    <MetricCard title="Weight" icon={Scale}>
      {s?.weightKg == null ? (
        <EmptyState>No weight logged yet.</EmptyState>
      ) : (
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-semibold tabular-nums">
            {formatKg(s.weightKg)}
          </span>
          {s.weight7dAvg != null && (
            <span className="text-muted-foreground text-xs">
              7-day avg {formatKg(s.weight7dAvg)}
            </span>
          )}
        </div>
      )}
    </MetricCard>
  );
}

export function IntakeCard({ s }: Props) {
  const has = s != null && (s.intakeKcal != null || s.proteinG != null);
  return (
    <MetricCard title="Intake" icon={Apple}>
      {!has ? (
        <EmptyState>No food logged yet.</EmptyState>
      ) : (
        <div className="space-y-2">
          <div className="flex items-baseline gap-4">
            <Stat
              value={
                s?.intakeKcal != null ? formatNumber(s.intakeKcal) : "—"
              }
              label="kcal"
            />
            <Stat
              value={
                s?.proteinG != null ? `${formatNumber(s.proteinG, 1)} g` : "—"
              }
              label="protein"
            />
          </div>
          <div className="text-muted-foreground text-xs tabular-nums">
            carbs {s?.carbG != null ? `${formatNumber(s.carbG, 1)} g` : "—"} ·
            fat {s?.fatG != null ? `${formatNumber(s.fatG, 1)} g` : "—"}
          </div>
        </div>
      )}
    </MetricCard>
  );
}

export function ActivityCard({ s }: Props) {
  const has = s != null && (s.steps != null || s.activeKcal != null);
  return (
    <MetricCard title="Activity" icon={Footprints}>
      {!has ? (
        <EmptyState>No activity data yet.</EmptyState>
      ) : (
        <div className="flex items-baseline gap-4">
          <Stat
            value={s?.steps != null ? formatNumber(s.steps) : "—"}
            label="steps"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-2xl font-semibold tabular-nums">
                {s?.activeKcal != null ? formatNumber(s.activeKcal) : "—"}
              </span>
              <Badge variant="outline" className="text-[10px]">
                trend
              </Badge>
            </div>
            {/* Wrist energy estimates carry 27–90% error — never presented as truth. */}
            <div className="text-muted-foreground text-xs">active kcal</div>
          </div>
        </div>
      )}
    </MetricCard>
  );
}

export function LiftingCard({ s }: Props) {
  const has = s != null && (s.liftingVolumeKg != null || s.workingSets != null);
  return (
    <MetricCard title="Lifting" icon={Dumbbell}>
      {!has ? (
        <EmptyState>No lifting logged yet.</EmptyState>
      ) : (
        <div className="flex items-baseline gap-4">
          <Stat
            value={
              s?.liftingVolumeKg != null
                ? `${formatNumber(s.liftingVolumeKg)} kg`
                : "—"
            }
            label="volume"
          />
          <Stat
            value={s?.workingSets != null ? formatNumber(s.workingSets) : "—"}
            label="working sets"
          />
        </div>
      )}
    </MetricCard>
  );
}
