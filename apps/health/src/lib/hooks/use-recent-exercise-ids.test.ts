import { describe, expect, it } from "vitest";

import { recentExerciseIds } from "./use-recent-exercise-ids";

function session(...exerciseIds: string[]) {
  return { exercises: exerciseIds.map((exerciseId) => ({ exerciseId })) };
}

describe("recentExerciseIds", () => {
  it("returns [] for undefined", () => {
    expect(recentExerciseIds(undefined)).toEqual([]);
  });

  it("returns [] for no sessions or no exercises", () => {
    expect(recentExerciseIds([])).toEqual([]);
    expect(recentExerciseIds([session()])).toEqual([]);
  });

  it("preserves within-session and across-session order", () => {
    expect(
      recentExerciseIds([session("squat", "bench"), session("deadlift")]),
    ).toEqual(["squat", "bench", "deadlift"]);
  });

  it("dedupes, keeping the first (newest) occurrence's position", () => {
    expect(
      recentExerciseIds([
        session("bench", "row"),
        session("squat", "bench"),
        session("row"),
      ]),
    ).toEqual(["bench", "row", "squat"]);
  });
});
