import { describe, expect, it } from "vitest";

import { computeSyncWindow } from "./sync-window";

// All cases pin `now` so the window is deterministic. 09:00 UTC is 11:00 in
// Amsterdam (CEST), so the local calendar day equals the UTC day here.
const NOW = new Date("2026-06-16T09:00:00Z");

function dateOnly(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

describe("computeSyncWindow", () => {
  const cases: {
    name: string;
    isFirstSync: boolean;
    lastBookingDate?: Date | null;
    now?: Date;
    overlapDays?: number;
    backfillMonths?: number;
    expected: { dateFrom: string; dateTo: string };
  }[] = [
    {
      name: "first sync backfills 12 months to today",
      isFirstSync: true,
      lastBookingDate: dateOnly("2026-06-10"),
      expected: { dateFrom: "2025-06-16", dateTo: "2026-06-16" },
    },
    {
      name: "first sync ignores lastBookingDate",
      isFirstSync: true,
      lastBookingDate: null,
      expected: { dateFrom: "2025-06-16", dateTo: "2026-06-16" },
    },
    {
      name: "incremental overlaps 3 days behind the last booking date",
      isFirstSync: false,
      lastBookingDate: dateOnly("2026-06-10"),
      expected: { dateFrom: "2026-06-07", dateTo: "2026-06-16" },
    },
    {
      name: "incremental with no last booking date falls back to backfill",
      isFirstSync: false,
      lastBookingDate: null,
      expected: { dateFrom: "2025-06-16", dateTo: "2026-06-16" },
    },
    {
      name: "custom overlap window",
      isFirstSync: false,
      lastBookingDate: dateOnly("2026-06-10"),
      overlapDays: 7,
      expected: { dateFrom: "2026-06-03", dateTo: "2026-06-16" },
    },
    {
      name: "custom backfill months",
      isFirstSync: true,
      lastBookingDate: null,
      backfillMonths: 3,
      expected: { dateFrom: "2026-03-16", dateTo: "2026-06-16" },
    },
    {
      name: "overlap crossing a month boundary",
      isFirstSync: false,
      lastBookingDate: dateOnly("2026-03-01"),
      now: new Date("2026-03-10T09:00:00Z"),
      expected: { dateFrom: "2026-02-26", dateTo: "2026-03-10" },
    },
    {
      name: "backfill crossing a year boundary",
      isFirstSync: true,
      lastBookingDate: null,
      now: new Date("2026-01-10T09:00:00Z"),
      expected: { dateFrom: "2025-01-10", dateTo: "2026-01-10" },
    },
    {
      name: "clamps a future last booking date to today",
      isFirstSync: false,
      lastBookingDate: dateOnly("2026-12-31"),
      expected: { dateFrom: "2026-06-16", dateTo: "2026-06-16" },
    },
  ];

  it.each(cases)("$name", ({ now = NOW, expected, ...rest }) => {
    expect(computeSyncWindow({ now, ...rest })).toEqual(expected);
  });

  it("never returns a backwards window", () => {
    const { dateFrom, dateTo } = computeSyncWindow({
      isFirstSync: false,
      lastBookingDate: dateOnly("2030-01-01"),
      now: NOW,
    });
    expect(dateFrom <= dateTo).toBe(true);
  });
});
