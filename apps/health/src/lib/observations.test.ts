import { describe, expect, it } from "vitest";

import { shiftDay } from "@/lib/dates";
import {
  alignByDay,
  lateCaffeineVsSleep,
  MIN_PAIRED_DAYS,
  pearson,
  readinessVsLiftingVolume,
  sleepVsNextDayReadiness,
  weightTrendVsSleep,
  type DayFlag,
  type DayValue,
} from "@/lib/observations";

// ── helpers ──
function series(start: string, values: number[]): DayValue[] {
  return values.map((value, i) => ({ day: shiftDay(start, i), value }));
}

function flags(start: string, values: boolean[]): DayFlag[] {
  return values.map((flag, i) => ({ day: shiftDay(start, i), flag }));
}

const START = "2026-06-01";

describe("pearson", () => {
  it("recovers a perfect positive correlation", () => {
    expect(pearson([[1, 1], [2, 2], [3, 3], [4, 4]])).toBeCloseTo(1, 10);
  });

  it("recovers a perfect negative correlation", () => {
    expect(pearson([[1, 4], [2, 3], [3, 2], [4, 1]])).toBeCloseTo(-1, 10);
  });

  it("is ~0 for an uncorrelated (symmetric) series", () => {
    // x rising, y a symmetric tent ⇒ covariance is exactly 0.
    expect(pearson([[1, 1], [2, 2], [3, 3], [4, 2], [5, 1]])).toBeCloseTo(0, 10);
  });

  it("returns null with fewer than two pairs", () => {
    expect(pearson([])).toBeNull();
    expect(pearson([[1, 1]])).toBeNull();
  });

  it("returns null when either axis is constant (zero variance)", () => {
    expect(pearson([[1, 5], [1, 6], [1, 7]])).toBeNull();
    expect(pearson([[5, 1], [6, 1], [7, 1]])).toBeNull();
  });

  it("clamps to [-1, 1]", () => {
    const r = pearson([[0, 0], [1, 1], [2, 2]]);
    expect(r).not.toBeNull();
    expect(r!).toBeLessThanOrEqual(1);
    expect(r!).toBeGreaterThanOrEqual(-1);
  });
});

describe("alignByDay", () => {
  it("inner-joins on the same day at lag 0", () => {
    const a = series(START, [10, 20, 30]);
    const b = series(START, [1, 2, 3]);
    expect(alignByDay(a, b)).toEqual([
      [10, 1],
      [20, 2],
      [30, 3],
    ]);
  });

  it("pairs x[D] with y[D+1] at lag 1", () => {
    const a = series(START, [10, 20, 30]); // days 0,1,2
    const b = series(START, [1, 2, 3, 4]); // days 0,1,2,3
    // x@0→y@1=2, x@1→y@2=3, x@2→y@3=4
    expect(alignByDay(a, b, 1)).toEqual([
      [10, 2],
      [20, 3],
      [30, 4],
    ]);
  });

  it("drops days missing on the other side", () => {
    const a = series(START, [10, 20, 30]);
    const b = [{ day: START, value: 1 }, { day: shiftDay(START, 2), value: 3 }];
    expect(alignByDay(a, b)).toEqual([
      [10, 1],
      [30, 3],
    ]);
  });
});

describe("sleepVsNextDayReadiness", () => {
  it("flags a strong positive lag-1 relationship", () => {
    // readiness[D+1] mirrors sleep[D] ⇒ strong positive at lag 1.
    const sleep = series(START, [50, 60, 70, 55, 80, 65, 75, 58, 62, 90]);
    const readiness = [
      { day: START, value: 40 }, // unpaired (no sleep at D-1 in window)
      ...series(shiftDay(START, 1), [50, 60, 70, 55, 80, 65, 75, 58, 62]),
    ];
    const obs = sleepVsNextDayReadiness(sleep, readiness, 30);
    expect(obs).not.toBeNull();
    expect(obs!.id).toBe("sleep-next-readiness");
    expect(obs!.direction).toBe("positive");
    expect(obs!.strength).toBeGreaterThan(0.9);
    expect(obs!.n).toBe(9);
    expect(obs!.finding).toContain("n=9");
  });

  it("returns null below the minimum paired days", () => {
    const sleep = series(START, [50, 60, 70, 55, 80]);
    const readiness = series(shiftDay(START, 1), [50, 60, 70, 55, 80]);
    expect(sleepVsNextDayReadiness(sleep, readiness, 30)).toBeNull();
  });
});

describe("readinessVsLiftingVolume", () => {
  it("reports a positive same-day correlation", () => {
    const readiness = series(START, [50, 55, 60, 65, 70, 75, 80, 85, 90]);
    const volume = series(START, [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800]);
    const obs = readinessVsLiftingVolume(readiness, volume, 30);
    expect(obs).not.toBeNull();
    expect(obs!.direction).toBe("positive");
    expect(obs!.strength).toBeCloseTo(1, 6);
    expect(obs!.n).toBe(9);
  });

  it("is exactly 0 for an uncorrelated series", () => {
    // Means land on exact values (readiness 50, volume 1500) so the covariance is 0 with
    // no float drift ⇒ a clean "none" direction.
    const readiness = series(START, [47, 49, 51, 53, 47, 49, 51, 53]);
    const volume = series(START, [1000, 1000, 1000, 1000, 2000, 2000, 2000, 2000]);
    const obs = readinessVsLiftingVolume(readiness, volume, 30);
    expect(obs).not.toBeNull();
    expect(obs!.strength).toBe(0);
    expect(obs!.direction).toBe("none");
  });
});

describe("weightTrendVsSleep", () => {
  it("reports a negative correlation when weight falls as sleep rises", () => {
    const weight = series(START, [85, 84.5, 84, 83.5, 83, 82.5, 82, 81.5, 81]);
    const sleep = series(START, [50, 55, 60, 65, 70, 75, 80, 85, 90]);
    const obs = weightTrendVsSleep(weight, sleep, 30);
    expect(obs).not.toBeNull();
    expect(obs!.direction).toBe("negative");
    expect(obs!.strength).toBeCloseTo(-1, 6);
    expect(obs!.finding).toContain("opposite to");
  });
});

describe("lateCaffeineVsSleep", () => {
  it("computes the mean-split finding and a negative point-biserial", () => {
    // 12 days, alternating late/not-late; sleep the NEXT night is 60 after a late day,
    // 70 otherwise ⇒ ~10 lower on late nights.
    const lateFlags = flags(
      START,
      Array.from({ length: 12 }, (_, i) => i % 2 === 0),
    );
    const sleep = series(
      shiftDay(START, 1),
      Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? 60 : 70)),
    );
    const obs = lateCaffeineVsSleep(lateFlags, sleep, 30, 14);
    expect(obs).not.toBeNull();
    expect(obs!.id).toBe("late-caffeine-sleep");
    expect(obs!.n).toBe(12);
    expect(obs!.direction).toBe("negative");
    expect(obs!.strength).toBeLessThan(0);
    expect(obs!.finding).toContain("~10 lower");
    expect(obs!.finding).toContain("14:00");
    expect(obs!.finding).toContain("n=12");
  });

  it("returns null when the flag never varies (no contrast)", () => {
    const lateFlags = flags(START, Array.from({ length: 12 }, () => true));
    const sleep = series(shiftDay(START, 1), Array.from({ length: 12 }, () => 65));
    expect(lateCaffeineVsSleep(lateFlags, sleep, 30, 14)).toBeNull();
  });

  it("returns null below the minimum paired nights", () => {
    const lateFlags = flags(START, [true, false, true, false, true]);
    const sleep = series(shiftDay(START, 1), [60, 70, 60, 70, 60]);
    expect(lateCaffeineVsSleep(lateFlags, sleep, 30, 14)).toBeNull();
  });
});

it("exposes the minimum-paired-days gate", () => {
  expect(MIN_PAIRED_DAYS).toBe(8);
});
