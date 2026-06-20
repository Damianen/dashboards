import { describe, expect, it } from "vitest";

import {
  type LastSet,
  type ProgressionPlan,
  suggestNextSet,
} from "./progression";

function plan(overrides: Partial<ProgressionPlan> = {}): ProgressionPlan {
  return { repMin: 6, repMax: 10, incrementKg: 2.5, ...overrides };
}

function last(reps: number, weightKg: number): LastSet {
  return { reps, weightKg };
}

describe("suggestNextSet", () => {
  describe("no history (last == null)", () => {
    it("starts at repMin with the template's start weight", () => {
      expect(suggestNextSet(null, plan({ startWeightKg: 60 }))).toEqual({
        reps: 6,
        weightKg: 60,
        weightIncreased: false,
      });
    });

    it("returns a null weight when startWeightKg is missing", () => {
      expect(suggestNextSet(null, plan())).toEqual({
        reps: 6,
        weightKg: null,
        weightIncreased: false,
      });
    });

    it("returns a null weight when startWeightKg is explicitly null", () => {
      expect(suggestNextSet(null, plan({ startWeightKg: null }))).toEqual({
        reps: 6,
        weightKg: null,
        weightIncreased: false,
      });
    });

    it("rounds the start weight to the nearest 0.5 kg", () => {
      expect(suggestNextSet(null, plan({ startWeightKg: 60.3 })).weightKg).toBe(
        60.5,
      );
    });
  });

  describe("below the top of the range", () => {
    it("adds one rep at the same weight", () => {
      expect(suggestNextSet(last(8, 80), plan())).toEqual({
        reps: 9,
        weightKg: 80,
        weightIncreased: false,
      });
    });

    it("adds a rep one short of the top (repMax - 1)", () => {
      expect(suggestNextSet(last(9, 80), plan())).toEqual({
        reps: 10,
        weightKg: 80,
        weightIncreased: false,
      });
    });

    it("rounds a fractional last weight to the nearest 0.5 kg", () => {
      expect(suggestNextSet(last(7, 80.3), plan()).weightKg).toBe(80.5);
    });
  });

  describe("at or over the top of the range -> bump", () => {
    it("bumps at exactly repMax (the boundary)", () => {
      expect(suggestNextSet(last(10, 80), plan())).toEqual({
        reps: 6,
        weightKg: 82.5,
        weightIncreased: true,
      });
    });

    it("bumps when reps exceeded repMax", () => {
      expect(suggestNextSet(last(12, 80), plan())).toEqual({
        reps: 6,
        weightKg: 82.5,
        weightIncreased: true,
      });
    });

    it("rounds the bumped weight to the nearest 0.5 kg", () => {
      // 80 + 1.25 = 81.25 -> 81.5
      expect(
        suggestNextSet(last(10, 80), plan({ incrementKg: 1.25 })).weightKg,
      ).toBe(81.5);
    });

    it("keeps an already-clean bump exact", () => {
      // 82.5 + 2.5 = 85
      expect(suggestNextSet(last(10, 82.5), plan()).weightKg).toBe(85);
    });
  });
});
