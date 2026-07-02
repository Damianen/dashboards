import { describe, expect, it } from "vitest";

import { averageRpe, bestE1rm, epleyE1rm } from "./one-rep-max";

describe("epleyE1rm", () => {
  it("returns the lifted weight unchanged at a true single", () => {
    expect(epleyE1rm(100, 1)).toBe(100);
  });

  it("matches the Epley formula for a multi-rep set", () => {
    // 100 × (1 + 5/30) = 116.666…
    expect(epleyE1rm(100, 5)).toBeCloseTo(116.6667, 4);
  });

  it("increases with both reps and weight", () => {
    expect(epleyE1rm(100, 6)).toBeGreaterThan(epleyE1rm(100, 5));
    expect(epleyE1rm(101, 5)).toBeGreaterThan(epleyE1rm(100, 5));
  });

  it("is 0 for a non-positive rep count or weight", () => {
    expect(epleyE1rm(100, 0)).toBe(0);
    expect(epleyE1rm(100, -3)).toBe(0);
    expect(epleyE1rm(0, 5)).toBe(0);
    expect(epleyE1rm(-50, 5)).toBe(0);
  });
});

describe("bestE1rm", () => {
  it("returns null when there are no working sets", () => {
    expect(bestE1rm([])).toBeNull();
    expect(
      bestE1rm([{ reps: 10, weightKg: 40, isWarmup: true }]),
    ).toBeNull();
  });

  it("picks the working set with the highest predicted e1RM", () => {
    // 100×3 → 110 ; 90×8 → 114 ; 120×1 → 120 (the winner).
    const best = bestE1rm([
      { reps: 3, weightKg: 100, isWarmup: false },
      { reps: 8, weightKg: 90, isWarmup: false },
      { reps: 1, weightKg: 120, isWarmup: false },
    ]);
    expect(best).toEqual({ e1rmKg: 120, reps: 1, weightKg: 120 });
  });

  it("ignores warmups even when they are heavier-looking", () => {
    const best = bestE1rm([
      { reps: 5, weightKg: 200, isWarmup: true },
      { reps: 5, weightKg: 100, isWarmup: false },
    ]);
    expect(best?.weightKg).toBe(100);
  });

  it("keeps the earliest set on a tie", () => {
    const best = bestE1rm([
      { reps: 5, weightKg: 100, isWarmup: false },
      { reps: 5, weightKg: 100, isWarmup: false },
    ]);
    expect(best).toEqual({ e1rmKg: epleyE1rm(100, 5), reps: 5, weightKg: 100 });
  });
});

describe("averageRpe", () => {
  it("is null for an empty or all-unrated day", () => {
    expect(averageRpe([])).toBeNull();
    expect(averageRpe([null, null])).toBeNull();
  });

  it("ignores unrated sets in the mean", () => {
    expect(averageRpe([8, null, 9])).toBe(8.5);
  });

  it("rounds to one decimal", () => {
    expect(averageRpe([8, 8, 9])).toBe(8.3);
    expect(averageRpe([7.5, 8.5])).toBe(8);
  });
});
