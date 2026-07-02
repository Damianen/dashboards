import { describe, expect, it } from "vitest";
import { DomainError } from "@/server/services/errors";
import {
  type ActualSet,
  computeWaterTarget,
  type LabelNutrients,
  type MacroOverrides,
  type Macros,
  type MealComponentMacros,
  mergeSnapshot,
  normalizeToPer100g,
  type PlanTarget,
  scaleMacros,
  setMeetsRepRange,
  shouldReuseSession,
  sumMealTotals,
  summarizePlanProgress,
  validateTemplateTarget,
} from "./rules";

describe("computeWaterTarget", () => {
  // The third argument is the day's UNIFIED caffeine total (stimulants + food +
  // supplements), summed in the SQL view; the math is unchanged.
  it("returns the base when there is no caffeine", () => {
    expect(computeWaterTarget(2500, 1, 0)).toBe(2500);
  });

  it("adds mlPerMg for each mg of total caffeine", () => {
    expect(computeWaterTarget(2500, 1, 200)).toBe(2700);
  });

  it("scales the bump by mlPerMg", () => {
    expect(computeWaterTarget(2500, 0.5, 200)).toBe(2600);
  });

  it("treats caffeine from any source identically (it's already summed)", () => {
    // 100 stimulant + 40 food + 200 supplement = 340 total → 2500 + 340×2.
    expect(computeWaterTarget(2500, 2, 100 + 40 + 200)).toBe(3180);
  });
});

describe("shouldReuseSession", () => {
  const now = new Date("2026-06-16T12:00:00.000Z");

  it("reuses a session started 2h59m ago", () => {
    const started = new Date(now.getTime() - (2 * 60 + 59) * 60 * 1000);
    expect(shouldReuseSession(started, now)).toBe(true);
  });

  it("does not reuse a session started 3h01m ago", () => {
    const started = new Date(now.getTime() - (3 * 60 + 1) * 60 * 1000);
    expect(shouldReuseSession(started, now)).toBe(false);
  });

  it("does not reuse when there is no prior session", () => {
    expect(shouldReuseSession(null, now)).toBe(false);
  });
});

describe("scaleMacros", () => {
  // Per-100g macros roughly modelled on Nutella (no fiber/caffeine reported → null).
  const per100g: Macros = {
    kcal: 539,
    proteinG: 6.3,
    carbG: 57.5,
    fatG: 30.9,
    fiberG: null,
    sugarG: 56.3,
    saltG: 0.1,
    caffeineMg: null,
  };

  it("returns the per-100g values unchanged for a 100 g portion", () => {
    expect(scaleMacros(per100g, 100)).toEqual(per100g);
  });

  it("scales each non-null field and rounds to 1 decimal", () => {
    const scaled = scaleMacros(per100g, 30);
    expect(scaled.kcal).toBe(161.7); // 539 * 0.3
    expect(scaled.proteinG).toBe(1.9); // 1.89 → 1.9
    expect(scaled.carbG).toBe(17.3); // 17.25 → 17.3
    expect(scaled.fatG).toBe(9.3); // 9.27 → 9.3
    expect(scaled.sugarG).toBe(16.9); // 16.89 → 16.9
    expect(scaled.saltG).toBe(0); // 0.03 → 0.0
  });

  it("keeps unreported nutrients null instead of computing 0", () => {
    expect(scaleMacros(per100g, 30).fiberG).toBe(null);
    expect(scaleMacros(per100g, 250).fiberG).toBe(null);
    expect(scaleMacros(per100g, 250).caffeineMg).toBe(null);
  });

  it("scales caffeine (mg per 100 g) like any other nutrient", () => {
    // An energy drink: 32 mg caffeine / 100 ml → a 250 ml can = 80 mg.
    const drink: Macros = { ...per100g, caffeineMg: 32 };
    expect(scaleMacros(drink, 250).caffeineMg).toBe(80);
    expect(scaleMacros(drink, 100).caffeineMg).toBe(32);
  });

  it("handles fractional gram quantities", () => {
    expect(scaleMacros({ ...per100g, kcal: 200 }, 12.5).kcal).toBe(25);
  });

  it("leaves an all-null set entirely null", () => {
    const empty: Macros = {
      kcal: null,
      proteinG: null,
      carbG: null,
      fatG: null,
      fiberG: null,
      sugarG: null,
      saltG: null,
      caffeineMg: null,
    };
    expect(scaleMacros(empty, 250)).toEqual(empty);
  });
});

describe("normalizeToPer100g", () => {
  const per100g: LabelNutrients = {
    kcal: 250,
    proteinG: 8,
    carbG: 30,
    fatG: 10,
    fiberG: 2,
    sugarG: 12,
    saltG: 0.5,
  };

  it("passes an explicit per-100g block through unchanged", () => {
    expect(
      normalizeToPer100g({ servingSizeG: 50, per100g, perServing: null }),
    ).toEqual(per100g);
  });

  it("prefers per-100g even when per-serving is also present", () => {
    const perServing: LabelNutrients = { ...per100g, kcal: 999 };
    expect(
      normalizeToPer100g({ servingSizeG: 50, per100g, perServing }),
    ).toBe(per100g);
  });

  it("converts a per-serving block by × 100 / servingSizeG", () => {
    const perServing: LabelNutrients = {
      kcal: 200,
      proteinG: 5,
      carbG: 15,
      fatG: 4,
    };
    // 50 g serving → ×2 to reach 100 g.
    expect(
      normalizeToPer100g({ servingSizeG: 50, per100g: null, perServing }),
    ).toEqual({
      kcal: 400,
      proteinG: 10,
      carbG: 30,
      fatG: 8,
      fiberG: null,
      sugarG: null,
      saltG: null,
    });
  });

  it("rounds the converted values to one decimal", () => {
    const perServing: LabelNutrients = {
      kcal: 133,
      proteinG: 7,
      carbG: 21,
      fatG: 3,
    };
    // 30 g serving → × 3.3333…
    expect(
      normalizeToPer100g({ servingSizeG: 30, per100g: null, perServing }),
    ).toEqual({
      kcal: 443.3, // 443.33… → 443.3
      proteinG: 23.3, // 23.33… → 23.3
      carbG: 70, // 69.99… → 70
      fatG: 10, // 9.99… → 10
      fiberG: null,
      sugarG: null,
      saltG: null,
    });
  });

  it("scales a reported detail macro but keeps unreported ones null", () => {
    const perServing: LabelNutrients = {
      kcal: 100,
      proteinG: 2,
      carbG: 10,
      fatG: 1,
      fiberG: 3,
      sugarG: null,
    };
    expect(
      normalizeToPer100g({ servingSizeG: 50, per100g: null, perServing }),
    ).toEqual({
      kcal: 200,
      proteinG: 4,
      carbG: 20,
      fatG: 2,
      fiberG: 6, // reported → scaled
      sugarG: null, // null stays null
      saltG: null, // absent stays null
    });
  });

  it("returns null when neither block is present", () => {
    expect(
      normalizeToPer100g({ servingSizeG: 50, per100g: null, perServing: null }),
    ).toBe(null);
  });

  it("returns null when only per-serving is given but the serving size is missing", () => {
    const perServing: LabelNutrients = {
      kcal: 200,
      proteinG: 5,
      carbG: 15,
      fatG: 4,
    };
    expect(
      normalizeToPer100g({ servingSizeG: null, per100g: null, perServing }),
    ).toBe(null);
  });
});

describe("validateTemplateTarget", () => {
  it("accepts a valid REPS target", () => {
    expect(() =>
      validateTemplateTarget({
        targetType: "REPS",
        targetSets: 4,
        repMin: 6,
        repMax: 10,
      }),
    ).not.toThrow();
  });

  it("accepts a valid VOLUME target", () => {
    expect(() =>
      validateTemplateTarget({ targetType: "VOLUME", targetVolumeKg: 5000 }),
    ).not.toThrow();
  });

  it("rejects a REPS target with repMin > repMax", () => {
    expect(() =>
      validateTemplateTarget({
        targetType: "REPS",
        targetSets: 4,
        repMin: 10,
        repMax: 6,
      }),
    ).toThrow(DomainError);
  });

  it("rejects a REPS target missing targetSets", () => {
    expect(() =>
      validateTemplateTarget({ targetType: "REPS", repMin: 6, repMax: 10 }),
    ).toThrow(DomainError);
  });
});

describe("setMeetsRepRange", () => {
  it("is true within the range", () => {
    expect(setMeetsRepRange(8, 6, 10)).toBe(true);
  });

  it("is false below the range", () => {
    expect(setMeetsRepRange(5, 6, 10)).toBe(false);
  });

  it("is false above the range", () => {
    expect(setMeetsRepRange(11, 6, 10)).toBe(false);
  });

  it("is true with no range and respects open-ended bounds", () => {
    expect(setMeetsRepRange(99)).toBe(true);
    expect(setMeetsRepRange(99, 6, null)).toBe(true);
    expect(setMeetsRepRange(3, null, 10)).toBe(true);
    expect(setMeetsRepRange(3, 6, null)).toBe(false);
  });
});

describe("summarizePlanProgress", () => {
  const repsPlan: PlanTarget = {
    exerciseId: "ex_bench",
    targetType: "REPS",
    targetSets: 3,
    repMin: 6,
    repMax: 10,
    targetVolumeKg: null,
  };

  it("marks a REPS item complete and counts in-range, non-warmup sets", () => {
    const sets: ActualSet[] = [
      { exerciseId: "ex_bench", reps: 12, weightKg: 40, isWarmup: true }, // warmup ignored
      { exerciseId: "ex_bench", reps: 8, weightKg: 80, isWarmup: false }, // in range
      { exerciseId: "ex_bench", reps: 9, weightKg: 80, isWarmup: false }, // in range
      { exerciseId: "ex_bench", reps: 5, weightKg: 80, isWarmup: false }, // below range
    ];
    expect(summarizePlanProgress([repsPlan], sets)).toEqual([
      {
        exerciseId: "ex_bench",
        targetSets: 3,
        setsDone: 3,
        inRangeSets: 2,
        targetVolumeKg: null,
        actualVolumeKg: 8 * 80 + 9 * 80 + 5 * 80,
        complete: true,
      },
    ]);
  });

  it("marks a REPS item incomplete when too few sets are done", () => {
    const sets: ActualSet[] = [
      { exerciseId: "ex_bench", reps: 8, weightKg: 80, isWarmup: false },
    ];
    expect(summarizePlanProgress([repsPlan], sets)).toEqual([
      {
        exerciseId: "ex_bench",
        targetSets: 3,
        setsDone: 1,
        inRangeSets: 1,
        targetVolumeKg: null,
        actualVolumeKg: 640,
        complete: false,
      },
    ]);
  });

  it("completes a VOLUME item once worked volume reaches the goal", () => {
    const volumePlan: PlanTarget = {
      exerciseId: "ex_row",
      targetType: "VOLUME",
      targetSets: null,
      repMin: null,
      repMax: null,
      targetVolumeKg: 1000,
    };
    const sets: ActualSet[] = [
      { exerciseId: "ex_row", reps: 10, weightKg: 60, isWarmup: false }, // 600
      { exerciseId: "ex_row", reps: 10, weightKg: 60, isWarmup: false }, // 600
    ];
    expect(summarizePlanProgress([volumePlan], sets)).toEqual([
      {
        exerciseId: "ex_row",
        targetSets: null,
        setsDone: 2,
        inRangeSets: 2,
        targetVolumeKg: 1000,
        actualVolumeKg: 1200,
        complete: true,
      },
    ]);
  });
});

describe("sumMealTotals", () => {
  const comp = (
    kcal: number,
    proteinG: number,
    carbG: number,
    fatG: number,
  ): MealComponentMacros => ({ kcal, proteinG, carbG, fatG });

  it("sums the components into the four plate totals", () => {
    expect(
      sumMealTotals([comp(300, 25, 30, 10), comp(150, 5, 20, 4)]),
    ).toEqual({
      totalKcal: 450,
      totalProteinG: 30,
      totalCarbG: 50,
      totalFatG: 14,
    });
  });

  it("rounds each total to 1 dp", () => {
    expect(
      sumMealTotals([comp(0, 1.05, 0.1, 0.04), comp(0, 0, 0.05, 0.03)]),
    ).toEqual({
      totalKcal: 0,
      totalProteinG: 1.1, // 1.05 → 1.1
      totalCarbG: 0.2, // 0.15 → 0.2
      totalFatG: 0.1, // 0.07 → 0.1
    });
  });

  it("ignores a single component's drifting totals — the parts are the truth", () => {
    // A lone component whose own numbers the caller would otherwise trust.
    expect(sumMealTotals([comp(523, 41, 62, 19)])).toEqual({
      totalKcal: 523,
      totalProteinG: 41,
      totalCarbG: 62,
      totalFatG: 19,
    });
  });
});

describe("mergeSnapshot", () => {
  const base: Macros = {
    kcal: 539,
    proteinG: 6.3,
    carbG: 57.5,
    fatG: 30.9,
    fiberG: null,
    sugarG: 56.3,
    saltG: 0.1,
    caffeineMg: null,
  };

  it("lets an explicit override win over the computed value", () => {
    const merged = mergeSnapshot({ kcal: 500, proteinG: 7 }, base);
    expect(merged.kcal).toBe(500);
    expect(merged.proteinG).toBe(7);
  });

  it("keeps every computed value when a field is omitted", () => {
    expect(mergeSnapshot({}, base)).toEqual(base);
    expect(mergeSnapshot({ kcal: 500 }, base).carbG).toBe(57.5);
  });

  it("preserves an intentional 0 override on a non-zero base (!== undefined, never ??)", () => {
    const merged = mergeSnapshot({ sugarG: 0 }, base);
    expect(merged.sugarG).toBe(0);
    expect(merged.kcal).toBe(539); // untouched fields still computed
  });

  it("leaves a null base null when nothing overrides it — never coerced to 0", () => {
    const merged = mergeSnapshot({ kcal: 500 }, base);
    expect(merged.caffeineMg).toBeNull();
    expect(merged.fiberG).toBeNull();
  });

  it("fills a null base from an override when one is present", () => {
    const overrides: MacroOverrides = { caffeineMg: 80, fiberG: 2.5 };
    const merged = mergeSnapshot(overrides, base);
    expect(merged.caffeineMg).toBe(80);
    expect(merged.fiberG).toBe(2.5);
  });
});
