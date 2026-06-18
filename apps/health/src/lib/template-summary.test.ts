import { describe, expect, it } from "vitest";
import { type SummaryExercise, templateSummary } from "./template-summary";

function reps(
  exerciseName: string,
  targetSets: number,
  repMin: number,
  repMax: number,
): SummaryExercise {
  return {
    exerciseName,
    targetType: "REPS",
    targetSets,
    repMin,
    repMax,
    targetVolumeKg: null,
  };
}

function volume(exerciseName: string, targetVolumeKg: number): SummaryExercise {
  return {
    exerciseName,
    targetType: "VOLUME",
    targetSets: null,
    repMin: null,
    repMax: null,
    targetVolumeKg,
  };
}

describe("templateSummary", () => {
  it("returns an empty string for no exercises", () => {
    expect(templateSummary([])).toBe("");
  });

  it("formats a single REPS exercise as sets×min–max", () => {
    expect(templateSummary([reps("Bench", 4, 6, 10)])).toBe("Bench 4×6–10");
  });

  it("formats a VOLUME exercise as volume kg", () => {
    expect(templateSummary([volume("Back work", 5000)])).toBe("Back work 5000 kg");
  });

  it("joins exactly two exercises with no +N tail", () => {
    expect(templateSummary([reps("Bench", 4, 6, 10), reps("OHP", 3, 8, 12)])).toBe(
      "Bench 4×6–10 · OHP 3×8–12",
    );
  });

  it("collapses the rest into a +N tail", () => {
    const list = [
      reps("Bench", 4, 6, 10),
      reps("OHP", 3, 8, 12),
      reps("Row", 4, 8, 12),
      reps("Curl", 3, 10, 15),
      volume("Abs", 2000),
    ];
    expect(templateSummary(list)).toBe("Bench 4×6–10 · OHP 3×8–12 · +3");
  });

  it("mixes REPS and VOLUME in the shown slots", () => {
    expect(templateSummary([volume("Abs", 3000), reps("Bench", 5, 5, 5)])).toBe(
      "Abs 3000 kg · Bench 5×5–5",
    );
  });
});
