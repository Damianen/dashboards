import { describe, expect, it } from "vitest";

import { dailyWorkoutMinutes } from "./workouts";

describe("dailyWorkoutMinutes", () => {
  it("sums durations per civil day and converts to whole minutes", () => {
    expect(
      dailyWorkoutMinutes([
        { day: "2026-06-20", durationSeconds: 2700 }, // 45m
        { day: "2026-06-20", durationSeconds: 900 }, // 15m
      ]),
    ).toEqual([{ day: "2026-06-20", value: 60 }]);
  });

  it("skips workouts with no duration", () => {
    expect(
      dailyWorkoutMinutes([
        { day: "2026-06-20", durationSeconds: null },
        { day: "2026-06-20", durationSeconds: 1800 },
      ]),
    ).toEqual([{ day: "2026-06-20", value: 30 }]);
  });

  it("sorts days ascending and rounds to the nearest minute", () => {
    expect(
      dailyWorkoutMinutes([
        { day: "2026-06-21", durationSeconds: 100 }, // 1.67m → 2
        { day: "2026-06-19", durationSeconds: 1810 }, // 30.17m → 30
      ]),
    ).toEqual([
      { day: "2026-06-19", value: 30 },
      { day: "2026-06-21", value: 2 },
    ]);
  });

  it("returns [] when there are no workouts", () => {
    expect(dailyWorkoutMinutes([])).toEqual([]);
  });
});
