import { describe, expect, it } from "vitest";

import {
  classifyWorkingSet,
  countPlanProgress,
  type PlanProgressLike,
  type SetClassPlan,
} from "./session-progress";

describe("countPlanProgress", () => {
  it("counts planned exercises and completed ones, ignoring extras", () => {
    const exercises: PlanProgressLike[] = [
      { plan: {}, progress: { complete: true } },
      { plan: {}, progress: { complete: false } },
      { plan: {}, progress: null },
      { plan: null, progress: null }, // an unplanned "Extra" exercise
    ];
    expect(countPlanProgress(exercises)).toEqual({ planned: 3, completed: 1 });
  });

  it("is all zeros for an ad-hoc session with no plan", () => {
    const exercises: PlanProgressLike[] = [
      { plan: null, progress: null },
      { plan: null, progress: null },
    ];
    expect(countPlanProgress(exercises)).toEqual({ planned: 0, completed: 0 });
  });
});

describe("classifyWorkingSet", () => {
  const reps: SetClassPlan = { targetType: "REPS", repMin: 6, repMax: 10 };

  it("marks warmups regardless of the plan", () => {
    expect(classifyWorkingSet({ isWarmup: true, reps: 8 }, reps)).toBe("warmup");
  });

  it("flags a working set inside the rep range", () => {
    expect(classifyWorkingSet({ isWarmup: false, reps: 8 }, reps)).toBe(
      "in-range",
    );
  });

  it("flags a working set outside the rep range", () => {
    expect(classifyWorkingSet({ isWarmup: false, reps: 12 }, reps)).toBe(
      "out-of-range",
    );
  });

  it("is neutral for a VOLUME plan", () => {
    const vol: SetClassPlan = {
      targetType: "VOLUME",
      repMin: null,
      repMax: null,
    };
    expect(classifyWorkingSet({ isWarmup: false, reps: 8 }, vol)).toBe(
      "neutral",
    );
  });

  it("is neutral for an unplanned exercise", () => {
    expect(classifyWorkingSet({ isWarmup: false, reps: 8 }, null)).toBe(
      "neutral",
    );
  });

  it("is neutral when a REPS plan carries no range", () => {
    const open: SetClassPlan = {
      targetType: "REPS",
      repMin: null,
      repMax: null,
    };
    expect(classifyWorkingSet({ isWarmup: false, reps: 8 }, open)).toBe(
      "neutral",
    );
  });
});
