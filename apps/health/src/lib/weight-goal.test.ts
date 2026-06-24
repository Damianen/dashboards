import { describe, expect, it } from "vitest";

import { projectGoalEta } from "./weight-goal";

describe("projectGoalEta", () => {
  it("projects weeks when cutting toward a lower goal", () => {
    // 5 kg to lose at -0.5 kg/week → 10 weeks.
    expect(
      projectGoalEta({ currentKg: 80, goalKg: 75, slopeKgPerWeek: -0.5 }),
    ).toEqual({ weeksToGoal: 10, onTrack: true });
  });

  it("projects weeks when bulking toward a higher goal", () => {
    // 5 kg to gain at +0.25 kg/week → 20 weeks.
    expect(
      projectGoalEta({ currentKg: 70, goalKg: 75, slopeKgPerWeek: 0.25 }),
    ).toEqual({ weeksToGoal: 20, onTrack: true });
  });

  it("is off-track with no ETA when the trend points the wrong way", () => {
    expect(
      projectGoalEta({ currentKg: 80, goalKg: 75, slopeKgPerWeek: 0.5 }),
    ).toEqual({ weeksToGoal: null, onTrack: false });
  });

  it("is off-track with no ETA when the trend is flat", () => {
    expect(
      projectGoalEta({ currentKg: 80, goalKg: 75, slopeKgPerWeek: 0 }),
    ).toEqual({ weeksToGoal: null, onTrack: false });
  });

  it("treats being within tolerance of the goal as reached", () => {
    const p = projectGoalEta({
      currentKg: 75.05,
      goalKg: 75,
      slopeKgPerWeek: -0.5,
    });
    expect(p).toEqual({ weeksToGoal: 0, onTrack: true });
  });
});
