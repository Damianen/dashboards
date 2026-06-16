import { describe, expect, it } from "vitest";

import { bucketWeekly, mergeByDay, mondayOf, type TrendPoint } from "./aggregate";

describe("mondayOf", () => {
  it("returns the same day for a Monday", () => {
    expect(mondayOf("2026-06-15")).toBe("2026-06-15");
  });
  it("rolls a midweek day back to its Monday", () => {
    // 2026-06-16 is a Tuesday.
    expect(mondayOf("2026-06-16")).toBe("2026-06-15");
  });
  it("treats Sunday as the last day of the same week (not the next)", () => {
    // 2026-06-14 is a Sunday.
    expect(mondayOf("2026-06-14")).toBe("2026-06-08");
  });
  it("is correct across the spring-forward DST week", () => {
    // 2026-03-29 is the Sunday DST changes; no day drift.
    expect(mondayOf("2026-03-29")).toBe("2026-03-23");
    expect(mondayOf("2026-03-30")).toBe("2026-03-30");
  });
  it("is correct across the fall-back DST week", () => {
    expect(mondayOf("2026-10-25")).toBe("2026-10-19");
  });
  it("groups a cross-year week under the December Monday", () => {
    expect(mondayOf("2025-12-29")).toBe("2025-12-29");
    expect(mondayOf("2026-01-04")).toBe("2025-12-29");
    expect(mondayOf("2026-01-05")).toBe("2026-01-05");
  });
});

describe("bucketWeekly", () => {
  const pts = (entries: [string, number][]): TrendPoint[] =>
    entries.map(([day, value]) => ({ day, value }));

  it("returns nothing for empty input", () => {
    expect(bucketWeekly([], "sum")).toEqual([]);
    expect(bucketWeekly([], "avg")).toEqual([]);
  });

  it("buckets a single point under its Monday", () => {
    expect(bucketWeekly(pts([["2026-06-16", 5]]), "sum")).toEqual([
      { weekStart: "2026-06-15", value: 5 },
    ]);
  });

  it("sums values that fall in the same week", () => {
    const out = bucketWeekly(
      pts([
        ["2026-06-15", 100], // Mon
        ["2026-06-17", 200], // Wed
        ["2026-06-21", 300], // Sun — still this week
      ]),
      "sum",
    );
    expect(out).toEqual([{ weekStart: "2026-06-15", value: 600 }]);
  });

  it("splits across the Monday boundary into two buckets", () => {
    const out = bucketWeekly(
      pts([
        ["2026-06-21", 10], // Sun, week of 06-15
        ["2026-06-22", 40], // Mon, week of 06-22
      ]),
      "sum",
    );
    expect(out).toEqual([
      { weekStart: "2026-06-15", value: 10 },
      { weekStart: "2026-06-22", value: 40 },
    ]);
  });

  it("averages only the present values (gaps do not dilute)", () => {
    // Two days present in a 7-day week → divide by 2, not 7.
    const out = bucketWeekly(
      pts([
        ["2026-06-15", 80],
        ["2026-06-18", 100],
      ]),
      "avg",
    );
    expect(out).toEqual([{ weekStart: "2026-06-15", value: 90 }]);
  });

  it("keeps a cross-year week in one bucket", () => {
    const out = bucketWeekly(
      pts([
        ["2025-12-29", 1], // Mon
        ["2026-01-01", 2], // Thu
        ["2026-01-04", 3], // Sun
      ]),
      "sum",
    );
    expect(out).toEqual([{ weekStart: "2025-12-29", value: 6 }]);
  });

  it("returns buckets sorted ascending by weekStart", () => {
    const out = bucketWeekly(
      pts([
        ["2026-06-22", 1],
        ["2026-06-01", 1],
        ["2026-06-15", 1],
      ]),
      "sum",
    );
    expect(out.map((b) => b.weekStart)).toEqual([
      "2026-06-01",
      "2026-06-15",
      "2026-06-22",
    ]);
  });
});

describe("mergeByDay", () => {
  it("aligns two series onto one row per day", () => {
    const out = mergeByDay({
      weight: [
        { day: "2026-06-15", value: 81 },
        { day: "2026-06-16", value: 80.5 },
      ],
      avg: [
        { day: "2026-06-15", value: 81.2 },
        { day: "2026-06-16", value: 81 },
      ],
    });
    expect(out).toEqual([
      { day: "2026-06-15", weight: 81, avg: 81.2 },
      { day: "2026-06-16", weight: 80.5, avg: 81 },
    ]);
  });

  it("unions days and omits a missing series key (recharts gap)", () => {
    const out = mergeByDay({
      a: [{ day: "2026-06-15", value: 1 }],
      b: [{ day: "2026-06-16", value: 2 }],
    });
    expect(out).toEqual([
      { day: "2026-06-15", a: 1 },
      { day: "2026-06-16", b: 2 },
    ]);
  });

  it("sorts rows ascending by day", () => {
    const out = mergeByDay({
      x: [
        { day: "2026-06-16", value: 2 },
        { day: "2026-06-14", value: 1 },
      ],
    });
    expect(out.map((r) => r.day)).toEqual(["2026-06-14", "2026-06-16"]);
  });

  it("returns nothing for empty input", () => {
    expect(mergeByDay({})).toEqual([]);
  });
});
