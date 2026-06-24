import { describe, expect, it } from "vitest";

import { shiftDay } from "@/lib/dates";
import {
  type DailyStatus,
  currentEpisodeStart,
  deviationFlag,
  MIN_BASELINE_SAMPLES,
  recoveryStatus,
  type RecoveryFlags,
  rollingBaseline,
  zScore,
} from "@/lib/recovery";

const TODAY = "2026-06-24";

// A flat baseline of `n` identical values, then `window` defaults to cover them.
function flat(value: number, n: number): number[] {
  return Array.from({ length: n }, () => value);
}

describe("rollingBaseline", () => {
  it("returns null below the minimum sample count", () => {
    expect(rollingBaseline(flat(50, MIN_BASELINE_SAMPLES - 1), 30)).toBeNull();
  });

  it("computes mean + population stddev at the minimum sample count", () => {
    const b = rollingBaseline([2, 4, 4, 4, 5, 5, 7, 9], 30);
    expect(b).not.toBeNull();
    expect(b?.n).toBe(8);
    expect(b?.mean).toBe(5); // (2+4+4+4+5+5+7+9)/8
    expect(b?.sd).toBeCloseTo(2, 10); // population stddev = 2
  });

  it("uses only the most-recent `window` values (today already excluded by caller)", () => {
    // 20 old high values then 8 recent values of 10 — window 8 should see only the 10s.
    const prior = [...flat(100, 20), ...flat(10, 8)];
    const b = rollingBaseline(prior, 8);
    expect(b?.mean).toBe(10);
    expect(b?.sd).toBe(0);
    expect(b?.n).toBe(8);
  });

  it("reports sd 0 for a flat history", () => {
    expect(rollingBaseline(flat(60, 10), 30)?.sd).toBe(0);
  });
});

describe("zScore", () => {
  it("is the signed distance in stddevs", () => {
    expect(zScore(60, { mean: 50, sd: 5, n: 10 })).toBe(2);
    expect(zScore(40, { mean: 50, sd: 5, n: 10 })).toBe(-2);
  });

  it("is null when the baseline can't discriminate (sd 0)", () => {
    expect(zScore(60, { mean: 50, sd: 0, n: 10 })).toBeNull();
  });
});

describe("deviationFlag", () => {
  const base = { mean: 50, sd: 4, n: 30 };

  it("flags a high-bad metric only when it rises above baseline", () => {
    expect(deviationFlag(50, base, "high-bad")).toBe("none");
    expect(deviationFlag(50 - 4 * 3, base, "high-bad")).toBe("none"); // far below = good
    expect(deviationFlag(50 + 4 * 1.5, base, "high-bad")).toBe("elevated");
    expect(deviationFlag(50 + 4 * 2.5, base, "high-bad")).toBe("high");
  });

  it("flags a low-bad metric (HRV) only when it drops below baseline", () => {
    expect(deviationFlag(50 + 4 * 3, base, "low-bad")).toBe("none"); // far above = good
    expect(deviationFlag(50 - 4 * 1.5, base, "low-bad")).toBe("elevated");
    expect(deviationFlag(50 - 4 * 2.5, base, "low-bad")).toBe("high");
  });

  it("never flags against a degenerate (sd 0) baseline", () => {
    expect(deviationFlag(999, { mean: 50, sd: 0, n: 30 }, "high-bad")).toBe("none");
  });
});

describe("recoveryStatus", () => {
  const all = (
    restingHr: RecoveryFlags["restingHr"],
    hrv: RecoveryFlags["hrv"],
    tempDeviation: RecoveryFlags["tempDeviation"],
  ): RecoveryFlags => ({ restingHr, hrv, tempDeviation });

  it("is normal when nothing is flagged", () => {
    expect(recoveryStatus(all("none", "none", "none"))).toBe("normal");
  });

  it("is insufficient only when every metric lacks a baseline", () => {
    expect(recoveryStatus(all("insufficient", "insufficient", "insufficient"))).toBe(
      "insufficient",
    );
    // A usable metric outvotes insufficient ones.
    expect(recoveryStatus(all("insufficient", "none", "insufficient"))).toBe("normal");
  });

  it("is elevated for a single mild signal", () => {
    expect(recoveryStatus(all("elevated", "none", "insufficient"))).toBe("elevated");
  });

  it("is high for a single strong signal (lone temperature spike)", () => {
    expect(recoveryStatus(all("none", "none", "high"))).toBe("high");
  });

  it("is high when two metrics deviate together, even mildly", () => {
    expect(recoveryStatus(all("elevated", "elevated", "none"))).toBe("high");
  });
});

describe("currentEpisodeStart", () => {
  // Build statuses for a run of days ending at `end`.
  function days(end: string, statuses: DailyStatus["status"][]): DailyStatus[] {
    const n = statuses.length;
    return statuses.map((status, i) => ({ day: shiftDay(end, -(n - 1 - i)), status }));
  }

  it("is null with no live episode", () => {
    expect(currentEpisodeStart(days(TODAY, ["normal", "normal"]), TODAY)).toBeNull();
  });

  it("returns the first day of the current off-baseline run", () => {
    const s = days(TODAY, ["normal", "elevated", "high", "high"]);
    expect(currentEpisodeStart(s, TODAY)).toBe(shiftDay(TODAY, -2));
  });

  it("stays alive when today has no reading but yesterday is off baseline", () => {
    const yesterday = shiftDay(TODAY, -1);
    const s = days(yesterday, ["normal", "high"]); // ends yesterday; only yesterday is off
    expect(currentEpisodeStart(s, TODAY)).toBe(yesterday);
  });

  it("resets after a return to normal (a later episode gets a new start day)", () => {
    // high two days ago, normal yesterday, high today → episode starts today.
    const s = days(TODAY, ["high", "normal", "high"]);
    expect(currentEpisodeStart(s, TODAY)).toBe(TODAY);
  });

  it("treats an insufficient day as a break in the run", () => {
    const s = days(TODAY, ["high", "insufficient", "high"]);
    expect(currentEpisodeStart(s, TODAY)).toBe(TODAY);
  });
});
