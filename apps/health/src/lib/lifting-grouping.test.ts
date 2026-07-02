import { describe, expect, it } from "vitest";
import {
  clampStep,
  groupSetsByExercise,
  parseStepperInput,
  type PlainSet,
  sessionVolumeKg,
  sessionWorkingSets,
  summarizeLastTime,
} from "./lifting-grouping";

// Helper to build a PlainSet with sensible defaults.
function set(p: Partial<PlainSet> & { exerciseId: string }): PlainSet {
  return {
    id: `${p.exerciseId}-${p.setNumber ?? 1}`,
    exerciseName: p.exerciseId === "a" ? "Bench Press" : "Squat",
    setNumber: 1,
    reps: 8,
    weightKg: 80,
    rpe: null,
    isWarmup: false,
    ...p,
  };
}

describe("groupSetsByExercise", () => {
  it("groups by exercise preserving first-appearance order", () => {
    // Logged A, B, A — A appeared first, so it leads and holds both its sets.
    const groups = groupSetsByExercise([
      set({ exerciseId: "a", setNumber: 1 }),
      set({ exerciseId: "b", setNumber: 1 }),
      set({ exerciseId: "a", setNumber: 2 }),
    ]);
    expect(groups.map((g) => g.exerciseId)).toEqual(["a", "b"]);
    expect(groups[0]?.sets).toHaveLength(2);
    expect(groups[1]?.sets).toHaveLength(1);
  });

  it("orders each group's sets by setNumber asc", () => {
    const groups = groupSetsByExercise([
      set({ exerciseId: "a", setNumber: 2 }),
      set({ exerciseId: "a", setNumber: 1 }),
      set({ exerciseId: "a", setNumber: 3 }),
    ]);
    expect(groups[0]?.sets.map((s) => s.setNumber)).toEqual([1, 2, 3]);
  });

  it("computes per-group volume excluding warmups", () => {
    const groups = groupSetsByExercise([
      set({ exerciseId: "a", setNumber: 1, isWarmup: true, reps: 10, weightKg: 40 }),
      set({ exerciseId: "a", setNumber: 2, reps: 8, weightKg: 80 }),
      set({ exerciseId: "a", setNumber: 3, reps: 8, weightKg: 80 }),
    ]);
    expect(groups[0]?.volumeKg).toBe(1280); // 8*80 + 8*80, warmup ignored
    expect(groups[0]?.workingSets).toBe(2);
  });

  it("returns an empty array for no sets", () => {
    expect(groupSetsByExercise([])).toEqual([]);
  });
});

describe("sessionVolumeKg / sessionWorkingSets", () => {
  it("sums working volume across exercises and excludes warmups", () => {
    const groups = groupSetsByExercise([
      set({ exerciseId: "a", reps: 8, weightKg: 80 }),
      set({ exerciseId: "b", reps: 5, weightKg: 100 }),
      set({ exerciseId: "b", setNumber: 2, isWarmup: true, reps: 5, weightKg: 60 }),
    ]);
    expect(sessionVolumeKg(groups)).toBe(8 * 80 + 5 * 100);
    expect(sessionWorkingSets(groups)).toBe(2);
  });

  it("sums fractional (2.5 kg) weights exactly", () => {
    const groups = groupSetsByExercise([
      set({ exerciseId: "a", reps: 8, weightKg: 82.5 }),
      set({ exerciseId: "a", setNumber: 2, reps: 8, weightKg: 82.5 }),
    ]);
    expect(sessionVolumeKg(groups)).toBe(1320); // 660 + 660
  });

  it("returns 0 volume for an all-warmup session", () => {
    const groups = groupSetsByExercise([
      set({ exerciseId: "a", isWarmup: true }),
      set({ exerciseId: "a", setNumber: 2, isWarmup: true }),
    ]);
    expect(sessionVolumeKg(groups)).toBe(0);
    expect(sessionWorkingSets(groups)).toBe(0);
  });
});

describe("summarizeLastTime", () => {
  it("collapses uniform working sets to 'count × reps @ weight kg'", () => {
    expect(
      summarizeLastTime([
        { reps: 8, weightKg: 80, isWarmup: false },
        { reps: 8, weightKg: 80, isWarmup: false },
        { reps: 8, weightKg: 80, isWarmup: false },
      ]),
    ).toBe("3 × 8 @ 80 kg");
  });

  it("ignores warmups when summarizing", () => {
    expect(
      summarizeLastTime([
        { reps: 10, weightKg: 40, isWarmup: true },
        { reps: 5, weightKg: 100, isWarmup: false },
      ]),
    ).toBe("1 × 5 @ 100 kg");
  });

  it("lists each set when reps or weight differ", () => {
    expect(
      summarizeLastTime([
        { reps: 8, weightKg: 80, isWarmup: false },
        { reps: 6, weightKg: 75, isWarmup: false },
      ]),
    ).toBe("8 @ 80kg, 6 @ 75kg");
  });

  it("formats fractional weights to one decimal", () => {
    expect(
      summarizeLastTime([{ reps: 8, weightKg: 82.5, isWarmup: false }]),
    ).toBe("1 × 8 @ 82.5 kg");
  });

  it("returns null when there are no working sets", () => {
    expect(summarizeLastTime([])).toBe(null);
    expect(
      summarizeLastTime([{ reps: 10, weightKg: 40, isWarmup: true }]),
    ).toBe(null);
  });
});

describe("clampStep", () => {
  it("adds the step in the given direction", () => {
    expect(clampStep(80, 1, 2.5, 0, 500)).toBe(82.5);
    expect(clampStep(80, -1, 2.5, 0, 500)).toBe(77.5);
  });

  it("clamps to min and max", () => {
    expect(clampStep(0, -1, 2.5, 0, 500)).toBe(0);
    expect(clampStep(500, 1, 2.5, 0, 500)).toBe(500);
    expect(clampStep(1, -1, 1, 1, 100)).toBe(1);
  });

  it("avoids floating-point drift on fractional steps", () => {
    // 0.1 + 0.2 would be 0.30000000000000004 without rounding.
    expect(clampStep(0.1, 1, 0.2, 0, 10)).toBe(0.3);
    expect(clampStep(8, 1, 0.5, 1, 10)).toBe(8.5);
  });
});

describe("parseStepperInput", () => {
  it("accepts a plain decimal weight", () => {
    expect(parseStepperInput("62.5", 2.5, 0, 500)).toBe(62.5);
  });

  it("accepts the Europe/Amsterdam decimal comma", () => {
    expect(parseStepperInput("62,5", 2.5, 0, 500)).toBe(62.5);
    expect(parseStepperInput("17,5", 2.5, 0, 500)).toBe(17.5);
  });

  it("rounds to the step's decimal precision", () => {
    expect(parseStepperInput("62.59", 2.5, 0, 500)).toBe(62.6); // 1-dp weight, up
    expect(parseStepperInput("62.51", 2.5, 0, 500)).toBe(62.5); // 1-dp weight, down
    expect(parseStepperInput("12.6", 1, 1, 100)).toBe(13); // whole reps
    expect(parseStepperInput("8.21", 0.5, 1, 10)).toBe(8.2); // 1-dp RPE
  });

  it("clamps to [min, max]", () => {
    expect(parseStepperInput("999", 2.5, 0, 500)).toBe(500);
    expect(parseStepperInput("-5", 2.5, 0, 500)).toBe(0);
  });

  it("returns null for empty or non-numeric input", () => {
    expect(parseStepperInput("", 2.5, 0, 500)).toBe(null);
    expect(parseStepperInput("   ", 2.5, 0, 500)).toBe(null);
    expect(parseStepperInput("abc", 2.5, 0, 500)).toBe(null);
    expect(parseStepperInput(",", 2.5, 0, 500)).toBe(null);
  });
});
