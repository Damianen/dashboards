import { describe, expect, it } from "vitest";

import {
  currentStreak,
  MILESTONES,
  milestonesReached,
  proteinTarget,
} from "@/lib/adherence";
import { shiftDay } from "@/lib/dates";

// A run of `n` consecutive civil days ending at (and including) `end`.
function run(end: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftDay(end, -(n - 1 - i)));
}

const TODAY = "2026-06-24";

describe("proteinTarget", () => {
  it("multiplies weight by g/kg", () => {
    expect(proteinTarget(80, 2)).toBe(160);
    expect(proteinTarget(72.5, 1.8)).toBe(131); // 130.5 → 131
  });

  it("rounds to whole grams", () => {
    expect(proteinTarget(81.3, 2)).toBe(163); // 162.6 → 163
    expect(proteinTarget(70.1, 2)).toBe(140); // 140.2 → 140
  });
});

describe("milestonesReached", () => {
  it("returns the milestones at or below the length", () => {
    expect(milestonesReached(0)).toEqual([]);
    expect(milestonesReached(6)).toEqual([]);
    expect(milestonesReached(7)).toEqual([7]);
    expect(milestonesReached(30)).toEqual([7, 30]);
    expect(milestonesReached(150)).toEqual([...MILESTONES]);
  });
});

describe("currentStreak", () => {
  it("is zero with no activity", () => {
    expect(currentStreak([], TODAY)).toEqual({ length: 0, startDay: null });
  });

  it("counts a single active day at today", () => {
    expect(currentStreak([TODAY], TODAY)).toEqual({
      length: 1,
      startDay: TODAY,
    });
  });

  it("counts a run of consecutive days ending today", () => {
    expect(currentStreak(run(TODAY, 5), TODAY)).toEqual({
      length: 5,
      startDay: shiftDay(TODAY, -4),
    });
  });

  it("stays alive when today is not yet logged but yesterday is (counts back from yesterday)", () => {
    const yesterday = shiftDay(TODAY, -1);
    expect(currentStreak(run(yesterday, 3), TODAY)).toEqual({
      length: 3,
      startDay: shiftDay(yesterday, -2),
    });
  });

  it("is broken when neither today nor yesterday is active", () => {
    const days = run(shiftDay(TODAY, -2), 4); // ends two days ago
    expect(currentStreak(days, TODAY)).toEqual({ length: 0, startDay: null });
  });

  it("only counts the run touching the anchor, not an earlier island", () => {
    const recent = run(TODAY, 3); // today, -1, -2
    const island = run(shiftDay(TODAY, -5), 2); // -5, -6 (gap at -3, -4)
    expect(currentStreak([...island, ...recent], TODAY)).toEqual({
      length: 3,
      startDay: shiftDay(TODAY, -2),
    });
  });

  it("ignores duplicate and unordered day strings", () => {
    const days = [TODAY, shiftDay(TODAY, -1), TODAY, shiftDay(TODAY, -2)];
    expect(currentStreak(days, TODAY)).toEqual({
      length: 3,
      startDay: shiftDay(TODAY, -2),
    });
  });

  it("computes a long run with the correct start day", () => {
    expect(currentStreak(run(TODAY, 100), TODAY)).toEqual({
      length: 100,
      startDay: shiftDay(TODAY, -99),
    });
  });

  it("steps civil days across a DST spring-forward boundary", () => {
    // Europe/Amsterdam springs forward on 2026-03-29; a backward walk must not lose a day.
    const end = "2026-03-30";
    expect(currentStreak(run(end, 4), end)).toEqual({
      length: 4,
      startDay: "2026-03-27",
    });
  });
});
