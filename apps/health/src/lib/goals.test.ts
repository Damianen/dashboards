import { describe, expect, it } from "vitest";

import { shiftDay } from "./dates";
import {
  capRate,
  computeTarget,
  dueCheckInDay,
  earliestRealisticDate,
  inferPhase,
  MAINTAIN_BAND_KG,
  MAX_DEFICIT_PCT,
  MAX_SURPLUS_PCT,
  proteinGPerKg,
  requiredRateKgPerWeek,
  weeklyProposal,
  weeksRemaining,
  type PhaseProteinGPerKg,
  type RateCaps,
  type TargetBounds,
} from "./goals";

const CAPS: RateCaps = { maxLossPctBwPerWeek: 0.75, maxGainPctBwPerWeek: 0.5 };
const BOUNDS: TargetBounds = {
  floorKcal: 1500,
  maxDeficitPct: MAX_DEFICIT_PCT,
  maxSurplusPct: MAX_SURPLUS_PCT,
};
const PROTEIN: PhaseProteinGPerKg = { cut: 2.2, maintain: 2.0, bulk: 1.8 };

describe("inferPhase", () => {
  it("goal below the trend weight is a CUT", () => {
    expect(inferPhase(80, 75)).toBe("CUT");
  });

  it("goal above the trend weight is a BULK", () => {
    expect(inferPhase(80, 84)).toBe("BULK");
  });

  it("goal within the ±0.5 kg band is MAINTAIN, edges inclusive", () => {
    expect(inferPhase(80, 80.3)).toBe("MAINTAIN");
    expect(inferPhase(80, 80 + MAINTAIN_BAND_KG)).toBe("MAINTAIN");
    expect(inferPhase(80, 80 - MAINTAIN_BAND_KG)).toBe("MAINTAIN");
    expect(inferPhase(80, 80.51)).toBe("BULK");
    expect(inferPhase(80, 79.49)).toBe("CUT");
  });
});

describe("requiredRateKgPerWeek", () => {
  it("pins the sign convention: a cut is NEGATIVE (positive = gaining)", () => {
    // 82 → 76 in 12 weeks: −6 kg / 12 wk = −0.5 kg/wk.
    expect(
      requiredRateKgPerWeek({
        trendWeightKg: 82,
        goalWeightKg: 76,
        weeksRemaining: 12,
      }),
    ).toBeCloseTo(-0.5, 6);
  });

  it("a bulk is positive, symmetric", () => {
    expect(
      requiredRateKgPerWeek({
        trendWeightKg: 76,
        goalWeightKg: 82,
        weeksRemaining: 12,
      }),
    ).toBeCloseTo(0.5, 6);
  });

  it("handles fractional weeks", () => {
    // −3 kg in 10 days (10/7 weeks) = −2.1 kg/wk.
    expect(
      requiredRateKgPerWeek({
        trendWeightKg: 80,
        goalWeightKg: 77,
        weeksRemaining: weeksRemaining("2026-07-10", "2026-07-20"),
      }),
    ).toBeCloseTo(-2.1, 6);
  });
});

describe("capRate", () => {
  it("passes an in-cap loss rate through untouched", () => {
    // 0.75% of 80 kg = 0.6 kg/wk cap.
    expect(capRate(-0.4, 80, CAPS)).toEqual({
      rateKgPerWeek: -0.4,
      capped: false,
    });
  });

  it("clamps a too-steep loss to the cap", () => {
    expect(capRate(-1.0, 80, CAPS)).toEqual({
      rateKgPerWeek: -0.6,
      capped: true,
    });
  });

  it("clamps a too-fast gain to the gain cap", () => {
    // 0.5% of 80 kg = 0.4 kg/wk.
    expect(capRate(0.6, 80, CAPS)).toEqual({
      rateKgPerWeek: 0.4,
      capped: true,
    });
  });

  it("a maintain rate of 0 passes through", () => {
    expect(capRate(0, 80, CAPS)).toEqual({ rateKgPerWeek: 0, capped: false });
  });
});

describe("earliestRealisticDate", () => {
  it("cut: days = ceil(distance / lossCap × 7)", () => {
    // 80 → 75 at 0.6 kg/wk: 5 / 0.6 × 7 = 58.33 → 59 days.
    expect(
      earliestRealisticDate({
        trendWeightKg: 80,
        goalWeightKg: 75,
        startDay: "2026-07-10",
        caps: CAPS,
      }),
    ).toBe(shiftDay("2026-07-10", 59));
  });

  it("bulk: symmetric under the gain cap", () => {
    // 80 → 82 at 0.4 kg/wk: 2 / 0.4 × 7 = 35 days exactly.
    expect(
      earliestRealisticDate({
        trendWeightKg: 80,
        goalWeightKg: 82,
        startDay: "2026-07-10",
        caps: CAPS,
      }),
    ).toBe(shiftDay("2026-07-10", 35));
  });
});

describe("computeTarget", () => {
  it("cut: TDEE + negative rate × 7700/7", () => {
    // 2600 + (−0.5 × 7700 / 7) = 2600 − 550 = 2050.
    expect(computeTarget(2600, -0.5, BOUNDS)).toEqual({
      targetKcal: 2050,
      bound: "none",
    });
  });

  it("bulk: lands above TDEE", () => {
    // 2400 + 0.3 × 1100 = 2730.
    expect(computeTarget(2400, 0.3, BOUNDS)).toEqual({
      targetKcal: 2730,
      bound: "none",
    });
  });

  it("the 25% deficit bound binds before the floor when TDEE is high", () => {
    // Raw 2400 − 1100 = 1300; lower = max(1500, 0.75 × 2400 = 1800) → 1800.
    expect(computeTarget(2400, -1.0, BOUNDS)).toEqual({
      targetKcal: 1800,
      bound: "maxDeficitPct",
    });
  });

  it("the absolute floor binds when TDEE is low", () => {
    // Raw 1900 − 1100 = 800; 0.75 × 1900 = 1425 < floor 1500 → floor.
    expect(computeTarget(1900, -1.0, BOUNDS)).toEqual({
      targetKcal: 1500,
      bound: "floor",
    });
  });

  it("the +20% surplus bound caps a bulk target", () => {
    // Raw 2000 + 1100 = 3100; 1.2 × 2000 = 2400.
    expect(computeTarget(2000, 1.0, BOUNDS)).toEqual({
      targetKcal: 2400,
      bound: "maxSurplusPct",
    });
  });

  it("rounds to the nearest 10 kcal", () => {
    // 2543 − 550 = 1993 → 1990.
    expect(computeTarget(2543, -0.5, BOUNDS)).toEqual({
      targetKcal: 1990,
      bound: "none",
    });
  });
});

describe("proteinGPerKg", () => {
  it("maps each phase to its factor", () => {
    expect(proteinGPerKg("CUT", PROTEIN)).toBe(2.2);
    expect(proteinGPerKg("MAINTAIN", PROTEIN)).toBe(2.0);
    expect(proteinGPerKg("BULK", PROTEIN)).toBe(1.8);
  });

  it("respects overridden factors", () => {
    expect(proteinGPerKg("CUT", { cut: 2.5, maintain: 2.0, bulk: 1.8 })).toBe(
      2.5,
    );
  });
});

describe("weeklyProposal", () => {
  const base = {
    currentTargetKcal: 2100,
    tdeeKcal: 2400,
    adjustmentCapKcal: 150,
    bounds: BOUNDS,
  };

  it("cut losing slower than planned: reduce, clamped to −150", () => {
    // error = −0.2 − (−0.5) = +0.3 → raw −330 → −150.
    const p = weeklyProposal({
      ...base,
      plannedRateKgPerWeek: -0.5,
      actualRateKgPerWeek: -0.2,
    });
    expect(p.proposedTargetKcal).toBe(1950);
    expect(p.adjustmentKcal).toBe(-150);
    expect(p.capped).toBe(true);
    expect(p.bound).toBe("none");
    expect(p.reason).toContain("reduce by 150");
    expect(p.reason).toContain("weekly cap");
  });

  it("cut losing faster than planned: increase, clamped to +150", () => {
    // error = −0.8 − (−0.5) = −0.3 → raw +330 → +150.
    const p = weeklyProposal({
      ...base,
      plannedRateKgPerWeek: -0.5,
      actualRateKgPerWeek: -0.8,
    });
    expect(p.proposedTargetKcal).toBe(2250);
    expect(p.adjustmentKcal).toBe(150);
    expect(p.capped).toBe(true);
    expect(p.reason).toContain("increase by 150");
  });

  it("bulk gaining faster than planned: reduce (symmetric)", () => {
    // error = +0.5 − 0.25 = +0.25 → raw −275 → −150.
    const p = weeklyProposal({
      currentTargetKcal: 2900,
      tdeeKcal: 2700,
      adjustmentCapKcal: 150,
      bounds: BOUNDS,
      plannedRateKgPerWeek: 0.25,
      actualRateKgPerWeek: 0.5,
    });
    expect(p.proposedTargetKcal).toBe(2750);
    expect(p.adjustmentKcal).toBe(-150);
    expect(p.capped).toBe(true);
  });

  it("within the cap: exact math, rounded to 10", () => {
    // error = +0.05 → raw −55 → candidate 2045 → 2050.
    const p = weeklyProposal({
      ...base,
      plannedRateKgPerWeek: -0.5,
      actualRateKgPerWeek: -0.45,
    });
    expect(p.proposedTargetKcal).toBe(2050);
    expect(p.adjustmentKcal).toBe(-50);
    expect(p.capped).toBe(false);
  });

  it("on plan: zero adjustment, says so", () => {
    const p = weeklyProposal({
      ...base,
      plannedRateKgPerWeek: -0.5,
      actualRateKgPerWeek: -0.5,
    });
    expect(p.proposedTargetKcal).toBe(2100);
    expect(p.adjustmentKcal).toBe(0);
    expect(p.capped).toBe(false);
    expect(p.reason).toContain("on plan");
  });

  it("a reduction is held at the floor (never below)", () => {
    // Current already at the floor; the −150 intent can't move it.
    const p = weeklyProposal({
      currentTargetKcal: 1500,
      tdeeKcal: 1900,
      adjustmentCapKcal: 150,
      bounds: BOUNDS,
      plannedRateKgPerWeek: -0.5,
      actualRateKgPerWeek: -0.2,
    });
    expect(p.proposedTargetKcal).toBe(1500);
    expect(p.adjustmentKcal).toBe(0);
    expect(p.bound).toBe("floor");
    expect(p.reason).toContain("1500 kcal floor");
    expect(p.reason).not.toContain("on plan");
  });
});

describe("dueCheckInDay", () => {
  it("nothing due before the first week has elapsed", () => {
    expect(dueCheckInDay("2026-07-01", "2026-07-01")).toBeNull();
    expect(dueCheckInDay("2026-07-01", "2026-07-07")).toBeNull();
  });

  it("due exactly on day 7", () => {
    expect(dueCheckInDay("2026-07-01", "2026-07-08")).toBe("2026-07-08");
  });

  it("mid-week returns the latest elapsed multiple of 7 (catch-up)", () => {
    expect(dueCheckInDay("2026-07-01", "2026-07-10")).toBe("2026-07-08");
  });

  it("only ever the latest due day, never a backfill list", () => {
    expect(dueCheckInDay("2026-07-01", "2026-07-16")).toBe("2026-07-15");
  });
});
