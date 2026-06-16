import { describe, expect, it } from "vitest";

import {
  fillTrendMonths,
  lastNMonthStarts,
  monthRange,
  savingsRate,
} from "./analytics";

// 09:00 UTC is 11:00 in Amsterdam, so the local calendar day equals the UTC day.
const TZ = "Europe/Amsterdam";

describe("monthRange", () => {
  it("brackets the current month", () => {
    expect(monthRange(new Date("2026-06-16T09:00:00Z"), TZ)).toEqual({
      start: "2026-06-01",
      nextStart: "2026-07-01",
    });
  });

  it("rolls over the year boundary in December", () => {
    expect(monthRange(new Date("2026-12-10T09:00:00Z"), TZ)).toEqual({
      start: "2026-12-01",
      nextStart: "2027-01-01",
    });
  });

  it("buckets a late-evening UTC instant into the next Amsterdam day's month", () => {
    // 2026-06-30 22:30Z is 2026-07-01 00:30 in Amsterdam (CEST).
    expect(monthRange(new Date("2026-06-30T22:30:00Z"), TZ)).toEqual({
      start: "2026-07-01",
      nextStart: "2026-08-01",
    });
  });
});

describe("lastNMonthStarts", () => {
  it("returns 6 ascending month-starts ending at the current month", () => {
    expect(lastNMonthStarts(new Date("2026-06-16T09:00:00Z"), 6, TZ)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
    ]);
  });

  it("crosses the year boundary", () => {
    expect(lastNMonthStarts(new Date("2026-02-16T09:00:00Z"), 6, TZ)).toEqual([
      "2025-09-01",
      "2025-10-01",
      "2025-11-01",
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
    ]);
  });
});

describe("savingsRate", () => {
  it("computes net / income", () => {
    expect(savingsRate(1000, 400)).toBeCloseTo(0.6);
  });
  it("is 0 when income is 0", () => {
    expect(savingsRate(0, 400)).toBe(0);
  });
  it("can be negative when expenses exceed income", () => {
    expect(savingsRate(1000, 1500)).toBeCloseTo(-0.5);
  });
});

describe("fillTrendMonths", () => {
  const starts = ["2026-04-01", "2026-05-01", "2026-06-01"];

  it("fills every month with zeros when there are no rows", () => {
    expect(fillTrendMonths(starts, [])).toEqual([
      { month: "2026-04", income: "0.00", expense: "0.00" },
      { month: "2026-05", income: "0.00", expense: "0.00" },
      { month: "2026-06", income: "0.00", expense: "0.00" },
    ]);
  });

  it("matches grouped rows by year-month and fills the gaps", () => {
    const rows = [
      { month: "2026-04-01", income: "100.00", expense: "40.00" },
      { month: "2026-06-01", income: "200.00", expense: "50.00" },
    ];
    expect(fillTrendMonths(starts, rows)).toEqual([
      { month: "2026-04", income: "100.00", expense: "40.00" },
      { month: "2026-05", income: "0.00", expense: "0.00" },
      { month: "2026-06", income: "200.00", expense: "50.00" },
    ]);
  });
});
