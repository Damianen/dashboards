import { describe, expect, it } from "vitest";

import { shiftDay } from "./dates";
import {
  confidenceLevel,
  estimateTDEE,
  KCAL_PER_KG,
  weightTrendKgPerWeek,
  type IntakeDay,
  type WeightPoint,
} from "./tdee";

// N consecutive civil days starting at `start`.
function days(start: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftDay(start, i));
}

// One fully-logged intake day per calendar day.
function loggedIntake(start: string, kcals: number[]): IntakeDay[] {
  return kcals.map((kcal, i) => ({ day: shiftDay(start, i), kcal, logged: true }));
}

// A weight series sampled every `stepDays` days, changing `kgPerWeek` linearly.
function weightSeries(
  start: string,
  count: number,
  startKg: number,
  kgPerWeek: number,
  stepDays = 1,
): WeightPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    day: shiftDay(start, i * stepDays),
    weightKg: startKg + (kgPerWeek / 7) * (i * stepDays),
  }));
}

describe("weightTrendKgPerWeek", () => {
  it("recovers a clean +0.7 kg/week trend", () => {
    const pts: WeightPoint[] = [
      { day: "2026-06-01", weightKg: 80 },
      { day: "2026-06-08", weightKg: 80.7 },
    ];
    expect(weightTrendKgPerWeek(pts)).toBeCloseTo(0.7, 6);
  });

  it("recovers a clean weight-loss trend (negative slope)", () => {
    const pts: WeightPoint[] = [
      { day: "2026-06-01", weightKg: 80 },
      { day: "2026-06-15", weightKg: 79 }, // -1 kg over 14 days = -0.5 kg/week
    ];
    expect(weightTrendKgPerWeek(pts)).toBeCloseTo(-0.5, 6);
  });

  it("regresses irregularly-spaced points by their true day offsets", () => {
    // Gaps between weigh-ins must not distort the slope.
    const pts: WeightPoint[] = [
      { day: "2026-06-01", weightKg: 80 },
      { day: "2026-06-03", weightKg: 79.8 },
      { day: "2026-06-10", weightKg: 79.1 }, // perfectly on the -0.7 kg/wk line
    ];
    expect(weightTrendKgPerWeek(pts)).toBeCloseTo(-0.7, 6);
  });

  it("is numerically stable across real (large epoch) dates", () => {
    // 21 daily points on an exact -0.35 kg/week line; mean-centering must keep it exact.
    const pts = weightSeries("2026-01-10", 21, 82.4, -0.35, 1);
    expect(weightTrendKgPerWeek(pts)).toBeCloseTo(-0.35, 6);
  });

  it("returns 0 for fewer than 2 distinct days", () => {
    expect(weightTrendKgPerWeek([])).toBe(0);
    expect(weightTrendKgPerWeek([{ day: "2026-06-01", weightKg: 80 }])).toBe(0);
    // Two readings, same day → no definable slope.
    expect(
      weightTrendKgPerWeek([
        { day: "2026-06-01", weightKg: 80 },
        { day: "2026-06-01", weightKg: 80.4 },
      ]),
    ).toBe(0);
  });
});

describe("estimateTDEE", () => {
  it("maintenance > intake when losing weight (deficit)", () => {
    const result = estimateTDEE({
      dailyIntake: loggedIntake("2026-06-01", Array(14).fill(2000)),
      // -0.5 kg/week.
      weightPoints: [
        { day: "2026-06-01", weightKg: 80 },
        { day: "2026-06-14", weightKg: 80 - (0.5 / 7) * 13 },
      ],
    });
    expect(result.meanIntake).toBe(2000);
    expect(result.slopeKgPerWeek).toBeCloseTo(-0.5, 6);
    // 2000 − (−0.5/7)*7700 = 2000 + 550 = 2550
    expect(result.tdee).toBeCloseTo(2550, 4);
    expect(result.tdee!).toBeGreaterThan(result.meanIntake!);
  });

  it("maintenance < intake when gaining weight (surplus)", () => {
    const result = estimateTDEE({
      dailyIntake: loggedIntake("2026-06-01", Array(14).fill(3000)),
      weightPoints: [
        { day: "2026-06-01", weightKg: 75 },
        { day: "2026-06-14", weightKg: 75 + (0.5 / 7) * 13 }, // +0.5 kg/week
      ],
    });
    expect(result.slopeKgPerWeek).toBeCloseTo(0.5, 6);
    expect(result.tdee).toBeCloseTo(2450, 4); // 3000 − 550
    expect(result.tdee!).toBeLessThan(result.meanIntake!);
  });

  it("maintenance ≈ intake when weight is flat", () => {
    const result = estimateTDEE({
      dailyIntake: loggedIntake("2026-06-01", Array(14).fill(2400)),
      weightPoints: weightSeries("2026-06-01", 14, 78, 0, 1),
    });
    expect(result.slopeKgPerWeek).toBeCloseTo(0, 9);
    expect(result.tdee).toBeCloseTo(2400, 6);
  });

  it("respects a custom kcalPerKg", () => {
    const result = estimateTDEE({
      dailyIntake: loggedIntake("2026-06-01", Array(7).fill(2000)),
      weightPoints: [
        { day: "2026-06-01", weightKg: 80 },
        { day: "2026-06-08", weightKg: 79 }, // -1 kg/week
      ],
      kcalPerKg: 7000,
    });
    // 2000 − (−1/7)*7000 = 2000 + 1000 = 3000
    expect(result.tdee).toBeCloseTo(3000, 4);
  });

  it("counts completeness over the full window, mean over logged days only", () => {
    const intake: IntakeDay[] = [
      ...loggedIntake("2026-06-01", [2000, 2200, 1800]), // 3 logged
      { day: "2026-06-04", kcal: 0, logged: false },
      { day: "2026-06-05", kcal: 0, logged: false },
    ];
    const result = estimateTDEE({
      dailyIntake: intake,
      weightPoints: weightSeries("2026-06-01", 5, 80, 0, 1),
    });
    expect(result.nDays).toBe(5);
    expect(result.nLoggedDays).toBe(3);
    expect(result.completeness).toBeCloseTo(0.6, 6);
    expect(result.meanIntake).toBeCloseTo(2000, 6); // (2000+2200+1800)/3, missing days excluded
  });

  it("returns null tdee with too few weight points", () => {
    const result = estimateTDEE({
      dailyIntake: loggedIntake("2026-06-01", Array(14).fill(2200)),
      weightPoints: [{ day: "2026-06-01", weightKg: 80 }],
    });
    expect(result.tdee).toBeNull();
    expect(result.meanIntake).toBe(2200); // still legible
  });

  it("returns null tdee and meanIntake when nothing is logged", () => {
    const result = estimateTDEE({
      dailyIntake: days("2026-06-01", 14).map((day) => ({
        day,
        kcal: 0,
        logged: false,
      })),
      weightPoints: weightSeries("2026-06-01", 14, 80, -0.4, 1),
    });
    expect(result.tdee).toBeNull();
    expect(result.meanIntake).toBeNull();
    expect(result.nLoggedDays).toBe(0);
    expect(result.completeness).toBe(0);
  });

  it("handles empty input without NaN", () => {
    const result = estimateTDEE({ dailyIntake: [], weightPoints: [] });
    expect(result).toEqual({
      tdee: null,
      meanIntake: null,
      slopeKgPerWeek: 0,
      nDays: 0,
      nLoggedDays: 0,
      completeness: 0,
    });
  });

  it("pins the default kcalPerKg to 7700", () => {
    expect(KCAL_PER_KG).toBe(7700);
  });
});

describe("confidenceLevel", () => {
  it("is low when logging completeness is poor", () => {
    expect(
      confidenceLevel({
        nLoggedDays: 6,
        completeness: 0.43,
        weightPointCount: 8,
        slopeKgPerWeek: -0.4,
      }),
    ).toBe("low");
  });

  it("is low with too few logged days even at full completeness", () => {
    expect(
      confidenceLevel({
        nLoggedDays: 8,
        completeness: 1,
        weightPointCount: 8,
        slopeKgPerWeek: -0.3,
      }),
    ).toBe("low");
  });

  it("is low with too few weight points", () => {
    expect(
      confidenceLevel({
        nLoggedDays: 14,
        completeness: 0.9,
        weightPointCount: 3,
        slopeKgPerWeek: -0.3,
      }),
    ).toBe("low");
  });

  it("forces low for an implausibly large weight swing", () => {
    expect(
      confidenceLevel({
        nLoggedDays: 20,
        completeness: 0.95,
        weightPointCount: 10,
        slopeKgPerWeek: 2.0, // > 1.5 kg/wk → noise
      }),
    ).toBe("low");
  });

  it("is medium for a decent but not pristine window", () => {
    expect(
      confidenceLevel({
        nLoggedDays: 14,
        completeness: 0.8,
        weightPointCount: 6,
        slopeKgPerWeek: -0.4,
      }),
    ).toBe("medium");
  });

  it("is high for a near-complete, weigh-most-days window", () => {
    expect(
      confidenceLevel({
        nLoggedDays: 19,
        completeness: 0.9,
        weightPointCount: 10,
        slopeKgPerWeek: -0.3,
      }),
    ).toBe("high");
  });
});
