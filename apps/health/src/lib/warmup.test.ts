import { describe, expect, it } from "vitest";

import {
  formatWarmupDef,
  resolveWarmupWeight,
  suggestWarmupSet,
  type WarmupDef,
} from "./warmup";

function absolute(weightKg: number, reps = 8): WarmupDef {
  return { reps, weightMode: "ABSOLUTE", weightKg, percentOfWorking: null };
}
function percent(percentOfWorking: number, reps = 8): WarmupDef {
  return { reps, weightMode: "PERCENT", weightKg: null, percentOfWorking };
}

describe("resolveWarmupWeight", () => {
  it("returns the absolute weight verbatim, ignoring the working weight", () => {
    expect(resolveWarmupWeight(absolute(40), 100)).toBe(40);
    expect(resolveWarmupWeight(absolute(40), null)).toBe(40);
  });

  it("takes a percentage of the working weight", () => {
    expect(resolveWarmupWeight(percent(50), 100)).toBe(50);
    expect(resolveWarmupWeight(percent(60), 100)).toBe(60);
  });

  it("rounds a percentage result to the nearest 0.5 kg", () => {
    expect(resolveWarmupWeight(percent(33), 63)).toBe(21); // 20.79 → 21
    expect(resolveWarmupWeight(percent(30), 57.5)).toBe(17.5); // 17.25 → 17.5
  });

  it("returns null when the working weight is null (nothing to scale)", () => {
    expect(resolveWarmupWeight(percent(50), null)).toBeNull();
  });
});

describe("suggestWarmupSet", () => {
  it("reuses last session's warmup at this position when present", () => {
    expect(suggestWarmupSet({ reps: 10, weightKg: 30 }, percent(50), 100)).toEqual({
      reps: 10,
      weightKg: 30,
    });
  });

  it("rounds the reused weight to the nearest 0.5 kg", () => {
    expect(suggestWarmupSet({ reps: 8, weightKg: 32.3 }, absolute(40), null)).toEqual({
      reps: 8,
      weightKg: 32.5,
    });
  });

  it("falls back to the template definition when there's no history", () => {
    expect(suggestWarmupSet(null, absolute(40, 6), 100)).toEqual({
      reps: 6,
      weightKg: 40,
    });
    expect(suggestWarmupSet(null, percent(50, 8), 100)).toEqual({
      reps: 8,
      weightKg: 50,
    });
  });

  it("falls back with a null weight when a % can't resolve (no working weight)", () => {
    expect(suggestWarmupSet(null, percent(50, 8), null)).toEqual({
      reps: 8,
      weightKg: null,
    });
  });
});

describe("formatWarmupDef", () => {
  it("formats a percent warmup as 'reps × N%'", () => {
    expect(formatWarmupDef(percent(50, 8))).toBe("8 × 50%");
  });

  it("formats an absolute warmup as 'reps × N kg'", () => {
    expect(formatWarmupDef(absolute(40, 8))).toBe("8 × 40 kg");
  });
});
