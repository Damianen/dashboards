import { describe, expect, it } from "vitest";

import { logSleepSchema } from "./sleep";

describe("logSleepSchema", () => {
  it("accepts both bedtimes (offset ISO)", () => {
    expect(
      logSleepSchema.safeParse({
        bedtimeStart: "2026-07-03T23:30:00+02:00",
        bedtimeEnd: "2026-07-04T07:30:00+02:00",
      }).success,
    ).toBe(true);
  });

  it("accepts a bare bedtimeStart (end defaults to now downstream)", () => {
    expect(
      logSleepSchema.safeParse({ bedtimeStart: "2026-07-03T23:30:00+02:00" })
        .success,
    ).toBe(true);
  });

  it("accepts a bare duration and a duration with an explicit end", () => {
    expect(logSleepSchema.safeParse({ durationMin: 450 }).success).toBe(true);
    expect(
      logSleepSchema.safeParse({
        durationMin: 450,
        bedtimeEnd: "2026-07-04T07:30:00+02:00",
      }).success,
    ).toBe(true);
  });

  it("requires exactly one of bedtimeStart / durationMin", () => {
    expect(logSleepSchema.safeParse({}).success).toBe(false);
    expect(
      logSleepSchema.safeParse({ bedtimeEnd: "2026-07-04T07:30:00+02:00" })
        .success,
    ).toBe(false);
    expect(
      logSleepSchema.safeParse({
        bedtimeStart: "2026-07-03T23:30:00+02:00",
        durationMin: 450,
      }).success,
    ).toBe(false);
  });

  it("bounds durationMin to whole minutes within 1..1440", () => {
    expect(logSleepSchema.safeParse({ durationMin: 1 }).success).toBe(true);
    expect(logSleepSchema.safeParse({ durationMin: 1440 }).success).toBe(true);
    expect(logSleepSchema.safeParse({ durationMin: 0 }).success).toBe(false);
    expect(logSleepSchema.safeParse({ durationMin: 1441 }).success).toBe(false);
    expect(logSleepSchema.safeParse({ durationMin: 450.5 }).success).toBe(false);
  });

  it("rejects non-ISO datetimes", () => {
    expect(
      logSleepSchema.safeParse({ bedtimeStart: "last night" }).success,
    ).toBe(false);
    expect(
      logSleepSchema.safeParse({
        durationMin: 450,
        bedtimeEnd: "07:30",
      }).success,
    ).toBe(false);
  });

  it("is strict — unknown keys are rejected", () => {
    expect(
      logSleepSchema.safeParse({ durationMin: 450, sleepScore: 80 }).success,
    ).toBe(false);
  });
});
