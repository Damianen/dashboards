import { describe, expect, it } from "vitest";

import type { DailySummary } from "@/server/services/summary";
import {
  compareWeeks,
  pickExtreme,
  summarizeWeek,
  type SummarizeWeekOpts,
} from "./weekly-review";

/** An all-null daily_summary row for `day` with the given metrics filled in. */
function row(day: string, overrides: Partial<DailySummary> = {}): DailySummary {
  return {
    day,
    weightKg: null,
    weight7dAvg: null,
    sleepScore: null,
    readinessScore: null,
    totalSleepMin: null,
    activeKcal: null,
    steps: null,
    intakeKcal: null,
    proteinG: null,
    carbG: null,
    fatG: null,
    waterMl: null,
    waterTargetMl: null,
    stimulantMg: null,
    caffeineMg: null,
    liftingVolumeKg: null,
    workingSets: null,
    supplementsTaken: null,
    bodyFatPct: null,
    muscleMassKg: null,
    deepMin: null,
    remMin: null,
    hrvMs: null,
    restingHrBpm: null,
    fiberG: null,
    ...overrides,
  };
}

const OPTS: SummarizeWeekOpts = {
  elapsedDays: 7,
  proteinTargetG: null,
  intakeKcalTarget: null,
  foodLoggedDays: 0,
  supplementCompleteDays: 0,
};

// A full past week, Monday 2026-06-15 .. Sunday 2026-06-21.
const MON = "2026-06-15";
const TUE = "2026-06-16";
const WED = "2026-06-17";
const THU = "2026-06-18";
const FRI = "2026-06-19";

describe("summarizeWeek", () => {
  it("averages ignore missing days (gaps never dilute)", () => {
    const week = summarizeWeek(
      [
        row(MON, { sleepScore: 80 }),
        row(TUE), // no sleep synced
        row(WED, { sleepScore: 90 }),
        row(THU, { readinessScore: 70 }),
      ],
      OPTS,
    );
    expect(week.sleep.avgScore).toBe(85); // (80+90)/2, not /4
    expect(week.readiness.avgScore).toBe(70);
  });

  it("sums the training/water domains and averages the sleep/intake ones", () => {
    const week = summarizeWeek(
      [
        row(MON, {
          liftingVolumeKg: 5000,
          workingSets: 12,
          totalSleepMin: 420,
          intakeKcal: 2000,
          proteinG: 140,
          fiberG: 30,
          waterMl: 2000,
          waterTargetMl: 2500,
        }),
        row(WED, {
          liftingVolumeKg: 3000,
          workingSets: 10,
          totalSleepMin: 480,
          intakeKcal: 2400,
          proteinG: 160,
          fiberG: 40,
          waterMl: 3000,
          waterTargetMl: 2500,
        }),
      ],
      OPTS,
    );
    expect(week.training.volumeKg).toBe(8000); // sum
    expect(week.training.workingSets).toBe(22); // sum
    expect(week.training.trainingDays).toBe(2);
    expect(week.water.totalMl).toBe(5000); // sum
    expect(week.sleep.avgDurationMin).toBe(450); // avg
    expect(week.intake.avgKcal).toBe(2200); // avg
    expect(week.intake.avgProteinG).toBe(150); // avg
    expect(week.intake.avgFiberG).toBe(35); // avg
    expect(week.intake.daysLogged).toBe(2);
  });

  it("counts a training day only when real work happened", () => {
    const week = summarizeWeek(
      [
        row(MON, { liftingVolumeKg: 4000, workingSets: 10 }),
        // A session of only warmups: the view reports 0 working sets / no volume.
        row(TUE, { liftingVolumeKg: 0, workingSets: 0 }),
        row(WED),
      ],
      OPTS,
    );
    expect(week.training.trainingDays).toBe(1);
  });

  it("computes water adherence against elapsed days for a partial week", () => {
    // A current week viewed on Friday: 5 elapsed days, rows only where data exists.
    const week = summarizeWeek(
      [
        row(MON, { waterMl: 2600, waterTargetMl: 2500 }), // met
        row(TUE, { waterMl: 2500, waterTargetMl: 2500 }), // met (>= is met)
        row(WED, { waterMl: 0, waterTargetMl: 2500 }), // logged nothing
        row(FRI, { waterMl: 1000, waterTargetMl: 3100 }), // under a caffeine-raised target
      ],
      { ...OPTS, elapsedDays: 5 },
    );
    expect(week.water.daysMetTarget).toBe(2);
    expect(week.water.daysElapsed).toBe(5);
    expect(week.water.totalMl).toBe(6100);
  });

  it("takes the LAST available 7-day weight average, not a mean", () => {
    const week = summarizeWeek(
      [
        row(MON, { weight7dAvg: 82.1 }),
        row(WED, { weight7dAvg: 81.8 }),
        row(FRI), // no weigh-in that day
      ],
      OPTS,
    );
    expect(week.weight.lastWeight7dAvg).toBe(81.8);
  });

  it("is order-independent for the last-available weight", () => {
    const week = summarizeWeek(
      [row(WED, { weight7dAvg: 81.8 }), row(MON, { weight7dAvg: 82.1 })],
      OPTS,
    );
    expect(week.weight.lastWeight7dAvg).toBe(81.8);
  });

  it("returns all-null aggregates for a week with no rows (counts included)", () => {
    const week = summarizeWeek([], {
      ...OPTS,
      elapsedDays: 7,
      foodLoggedDays: 0,
      supplementCompleteDays: 0,
    });
    expect(week.training).toEqual({
      volumeKg: null,
      workingSets: null,
      trainingDays: null,
    });
    expect(week.sleep).toEqual({ avgScore: null, avgDurationMin: null });
    expect(week.readiness).toEqual({ avgScore: null });
    expect(week.weight).toEqual({ lastWeight7dAvg: null });
    expect(week.intake.avgKcal).toBeNull();
    expect(week.intake.avgProteinG).toBeNull();
    expect(week.intake.avgFiberG).toBeNull();
    expect(week.intake.daysLogged).toBeNull();
    expect(week.water.daysMetTarget).toBeNull();
    expect(week.water.totalMl).toBeNull();
    // Caller-supplied context still passes through.
    expect(week.water.daysElapsed).toBe(7);
    expect(week.consistency).toEqual({
      foodLoggedDays: 0,
      supplementCompleteDays: 0,
    });
  });

  it("passes the standing targets through as context", () => {
    const week = summarizeWeek([row(MON, { intakeKcal: 2000 })], {
      ...OPTS,
      proteinTargetG: 160,
      intakeKcalTarget: 2400,
      foodLoggedDays: 1,
      supplementCompleteDays: 1,
    });
    expect(week.intake.kcalTarget).toBe(2400);
    expect(week.intake.proteinTargetG).toBe(160);
    expect(week.consistency).toEqual({
      foodLoggedDays: 1,
      supplementCompleteDays: 1,
    });
  });
});

describe("compareWeeks", () => {
  it("computes current − previous per metric", () => {
    const current = summarizeWeek(
      [
        row(MON, {
          sleepScore: 85,
          liftingVolumeKg: 6000,
          workingSets: 14,
          weight7dAvg: 81.5,
          intakeKcal: 2200,
          waterMl: 2600,
          waterTargetMl: 2500,
        }),
      ],
      { ...OPTS, foodLoggedDays: 6, supplementCompleteDays: 5 },
    );
    const previous = summarizeWeek(
      [
        row("2026-06-08", {
          sleepScore: 80,
          liftingVolumeKg: 5000,
          workingSets: 10,
          weight7dAvg: 82.0,
          intakeKcal: 2400,
          waterMl: 2000,
          waterTargetMl: 2500,
        }),
      ],
      { ...OPTS, foodLoggedDays: 7, supplementCompleteDays: 7 },
    );
    const deltas = compareWeeks(current, previous);
    expect(deltas.sleep.avgScore).toBe(5);
    expect(deltas.training.volumeKg).toBe(1000);
    expect(deltas.training.workingSets).toBe(4);
    expect(deltas.weight.lastWeight7dAvg).toBeCloseTo(-0.5);
    expect(deltas.intake.avgKcal).toBe(-200);
    expect(deltas.water.daysMetTarget).toBe(1);
    expect(deltas.water.totalMl).toBe(600);
    expect(deltas.consistency.foodLoggedDays).toBe(-1);
    expect(deltas.consistency.supplementCompleteDays).toBe(-2);
  });

  it("is null-safe when the previous week is empty", () => {
    const current = summarizeWeek(
      [row(MON, { sleepScore: 85, liftingVolumeKg: 6000 })],
      OPTS,
    );
    const previous = summarizeWeek([], OPTS);
    const deltas = compareWeeks(current, previous);
    expect(deltas.sleep.avgScore).toBeNull();
    expect(deltas.training.volumeKg).toBeNull();
    expect(deltas.training.trainingDays).toBeNull();
    expect(deltas.weight.lastWeight7dAvg).toBeNull();
    expect(deltas.intake.daysLogged).toBeNull();
    expect(deltas.water.daysMetTarget).toBeNull();
    // Consistency counts are service-counted (0 is real), so the delta survives.
    expect(deltas.consistency.foodLoggedDays).toBe(0);
  });

  it("is null-safe when the current week is empty", () => {
    const current = summarizeWeek([], OPTS);
    const previous = summarizeWeek([row(MON, { readinessScore: 70 })], OPTS);
    const deltas = compareWeeks(current, previous);
    expect(deltas.readiness.avgScore).toBeNull();
    expect(deltas.sleep.avgScore).toBeNull();
    expect(deltas.water.totalMl).toBeNull();
  });

  it("nulls a metric absent in just one week even when others compare fine", () => {
    const current = summarizeWeek(
      [row(MON, { sleepScore: 85 })], // no readiness synced this week
      OPTS,
    );
    const previous = summarizeWeek(
      [row("2026-06-08", { sleepScore: 80, readinessScore: 75 })],
      OPTS,
    );
    const deltas = compareWeeks(current, previous);
    expect(deltas.sleep.avgScore).toBe(5);
    expect(deltas.readiness.avgScore).toBeNull();
  });
});

describe("pickExtreme", () => {
  const rows = [
    row(MON, { sleepScore: 80, readinessScore: 60 }),
    row(TUE, { sleepScore: 91, readinessScore: 85 }),
    row(WED, { readinessScore: 55, liftingVolumeKg: 8000 }),
    row(THU, { sleepScore: 76 }),
  ];

  it("finds the max day with a friendly label", () => {
    expect(pickExtreme(rows, "sleepScore", "max")).toEqual({
      day: TUE,
      label: "Sleep score",
      value: 91,
    });
    expect(pickExtreme(rows, "liftingVolumeKg", "max")).toEqual({
      day: WED,
      label: "Lifting volume",
      value: 8000,
    });
  });

  it("finds the min day (worst readiness)", () => {
    expect(pickExtreme(rows, "readinessScore", "min")).toEqual({
      day: WED,
      label: "Readiness",
      value: 55,
    });
  });

  it("breaks ties by the EARLIEST day, independent of row order", () => {
    const tied = [
      row(WED, { sleepScore: 90 }),
      row(MON, { sleepScore: 90 }),
      row(TUE, { sleepScore: 85 }),
    ];
    expect(pickExtreme(tied, "sleepScore", "max")?.day).toBe(MON);
    const tiedMin = [row(THU, { readinessScore: 50 }), row(TUE, { readinessScore: 50 })];
    expect(pickExtreme(tiedMin, "readinessScore", "min")?.day).toBe(TUE);
  });

  it("returns null when no day has the metric (and for empty rows)", () => {
    expect(pickExtreme(rows, "steps", "max")).toBeNull();
    expect(pickExtreme([], "sleepScore", "max")).toBeNull();
  });
});
