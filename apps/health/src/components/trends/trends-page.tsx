"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ActivityCard } from "@/components/trends/cards/activity-card";
import { BodyCompositionCard } from "@/components/trends/cards/body-composition-card";
import { CaffeineCard } from "@/components/trends/cards/caffeine-card";
import { E1rmCard } from "@/components/trends/cards/e1rm-card";
import { IntakeCard } from "@/components/trends/cards/intake-card";
import { LiftingCard } from "@/components/trends/cards/lifting-card";
import { MuscleVolumeCard } from "@/components/trends/cards/muscle-volume-card";
import { RecoveryTrendCard } from "@/components/trends/cards/recovery-trend-card";
import { SleepDurationCard } from "@/components/trends/cards/sleep-duration-card";
import { SleepReadinessCard } from "@/components/trends/cards/sleep-readiness-card";
import { WaterCard } from "@/components/trends/cards/water-card";
import { WeightCard } from "@/components/trends/cards/weight-card";
import { WorkoutsCard } from "@/components/trends/cards/workouts-card";
import { TdeeCard } from "@/components/trends/tdee-card";

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
