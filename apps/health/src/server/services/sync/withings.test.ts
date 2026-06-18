import { describe, expect, it } from "vitest";

import { withingsQuery } from "./withings";

const HOUR_MS = 60 * 60 * 1000;
// 2026-06-16T10:00Z → 12:00 Amsterdam (CEST) → civil day 2026-06-16.
const now = new Date("2026-06-16T10:00:00.000Z");

describe("withingsQuery", () => {
  it("backfills an absolute window on the first run (no prior OK)", () => {
    const plan = withingsQuery({
      lastOkStartedAt: null,
      now,
      overlapMs: HOUR_MS,
      backfillDays: 90,
    });
    expect("startdate" in plan.query).toBe(true);
    if ("startdate" in plan.query) {
      expect(plan.query.startdate).toBe(
        Math.floor(new Date("2026-03-18T00:00:00.000Z").getTime() / 1000),
      );
      expect(plan.query.enddate).toBe(Math.floor(now.getTime() / 1000));
    }
    expect(plan.window).toEqual({
      startDate: "2026-03-18",
      endDate: "2026-06-16",
    });
  });

  it("respects a custom backfill window", () => {
    const plan = withingsQuery({
      lastOkStartedAt: null,
      now,
      overlapMs: HOUR_MS,
      backfillDays: 7,
    });
    expect(plan.window.startDate).toBe("2026-06-09");
  });

  it("pulls by lastupdate = last OK startedAt − overlap on incremental runs", () => {
    const lastOkStartedAt = new Date("2026-06-16T08:00:00.000Z");
    const plan = withingsQuery({
      lastOkStartedAt,
      now,
      overlapMs: HOUR_MS,
      backfillDays: 90,
    });
    expect("lastupdate" in plan.query).toBe(true);
    if ("lastupdate" in plan.query) {
      expect(plan.query.lastupdate).toBe(
        Math.floor((lastOkStartedAt.getTime() - HOUR_MS) / 1000),
      );
    }
    expect(plan.window.endDate).toBe("2026-06-16");
  });

  it("clamps a future-dated watermark so lastupdate never exceeds now", () => {
    const plan = withingsQuery({
      lastOkStartedAt: new Date("2026-06-17T10:00:00.000Z"), // clock skew
      now,
      overlapMs: 0,
      backfillDays: 90,
    });
    if ("lastupdate" in plan.query) {
      expect(plan.query.lastupdate).toBe(Math.floor(now.getTime() / 1000));
    } else {
      throw new Error("expected an incremental lastupdate query");
    }
  });
});
