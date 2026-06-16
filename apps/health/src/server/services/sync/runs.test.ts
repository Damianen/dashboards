import { describe, expect, it } from "vitest";

import { dayToDbDate } from "@/lib/dates";
import { computeSyncWindow } from "./runs";

describe("computeSyncWindow", () => {
  it("backfills `backfillDays` from today on the first run (no OK watermark)", () => {
    expect(
      computeSyncWindow({
        lastOkWindowEnd: null,
        today: "2026-06-16",
        overlapDays: 3,
        backfillDays: 90,
      }),
    ).toEqual({ startDate: "2026-03-18", endDate: "2026-06-16" });
  });

  it("honors a custom backfill window", () => {
    expect(
      computeSyncWindow({
        lastOkWindowEnd: null,
        today: "2026-06-16",
        overlapDays: 3,
        backfillDays: 30,
      }),
    ).toEqual({ startDate: "2026-05-17", endDate: "2026-06-16" });
  });

  it("starts `overlapDays` before the last OK watermark on an incremental run", () => {
    expect(
      computeSyncWindow({
        lastOkWindowEnd: dayToDbDate("2026-06-16"),
        today: "2026-06-20",
        overlapDays: 3,
        backfillDays: 90,
      }),
    ).toEqual({ startDate: "2026-06-13", endDate: "2026-06-20" });
  });

  it("round-trips the UTC-midnight watermark to its civil day in summer (CEST)", () => {
    // overlap 0 isolates the dayOf(dayToDbDate(...)) round-trip from the shift.
    expect(
      computeSyncWindow({
        lastOkWindowEnd: dayToDbDate("2026-06-16"),
        today: "2026-06-30",
        overlapDays: 0,
        backfillDays: 90,
      }).startDate,
    ).toBe("2026-06-16");
  });

  it("round-trips the UTC-midnight watermark to its civil day in winter (CET)", () => {
    expect(
      computeSyncWindow({
        lastOkWindowEnd: dayToDbDate("2026-01-16"),
        today: "2026-01-30",
        overlapDays: 0,
        backfillDays: 90,
      }).startDate,
    ).toBe("2026-01-16");
  });

  it("does not drop a day across the spring-forward DST boundary", () => {
    expect(
      computeSyncWindow({
        lastOkWindowEnd: dayToDbDate("2026-03-29"),
        today: "2026-04-05",
        overlapDays: 3,
        backfillDays: 90,
      }).startDate,
    ).toBe("2026-03-26");
  });

  it("does not drop a day across the fall-back DST boundary", () => {
    expect(
      computeSyncWindow({
        lastOkWindowEnd: dayToDbDate("2026-10-25"),
        today: "2026-11-01",
        overlapDays: 3,
        backfillDays: 90,
      }).startDate,
    ).toBe("2026-10-22");
  });

  it("clamps a future-dated watermark so the window never inverts", () => {
    expect(
      computeSyncWindow({
        lastOkWindowEnd: dayToDbDate("2026-06-30"),
        today: "2026-06-16",
        overlapDays: 3,
        backfillDays: 90,
      }),
    ).toEqual({ startDate: "2026-06-16", endDate: "2026-06-16" });
  });
});
