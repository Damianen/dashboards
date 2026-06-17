import { describe, expect, it } from "vitest";

import {
  detectRecurrence,
  intervalLabel,
  median,
  monthlyEquivalentCents,
  nextExpectedDate,
  subscriptionState,
  type Occurrence,
} from "./recurrence";

const DAY = 86_400_000;

function day(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

/** `n` occurrences stepping `stepDays` from `startISO`, with the given cents. */
function series(startISO: string, stepDays: number, cents: number[]): Occurrence[] {
  const start = day(startISO).getTime();
  return cents.map((amountCents, i) => ({
    date: new Date(start + i * stepDays * DAY),
    amountCents,
  }));
}

describe("median", () => {
  it.each([
    { nums: [] as number[], expected: 0 },
    { nums: [5], expected: 5 },
    { nums: [3, 1, 2], expected: 2 },
    { nums: [4, 1, 3, 2], expected: 2.5 },
    { nums: [30, 30, 60, 30, 30], expected: 30 },
  ])("median($nums) = $expected", ({ nums, expected }) => {
    expect(median(nums)).toBe(expected);
  });
});

describe("detectRecurrence", () => {
  const cases: {
    name: string;
    txs: Occurrence[];
    expected: ReturnType<typeof detectRecurrence>;
  }[] = [
    { name: "empty → null", txs: [], expected: null },
    {
      name: "two occurrences (< MIN_OCCURRENCES) → null",
      txs: series("2026-01-01", 30, [-1000, -1000]),
      expected: null,
    },
    {
      name: "three clean monthly → monthly series, no increase",
      txs: series("2026-04-03", 30, [-999, -999, -999]),
      expected: {
        intervalDays: 30,
        expectedAmountCents: -999,
        previousAmountCents: null,
        lastSeenDate: new Date(day("2026-04-03").getTime() + 60 * DAY),
        occurrenceCount: 3,
      },
    },
    {
      name: "weekly cluster → 7-day interval",
      txs: series("2026-05-01", 7, [-499, -499, -499, -499, -499]),
      expected: {
        intervalDays: 7,
        expectedAmountCents: -499,
        previousAmountCents: null,
        lastSeenDate: new Date(day("2026-05-01").getTime() + 28 * DAY),
        occurrenceCount: 5,
      },
    },
    {
      name: "quarterly cluster → 90-day interval",
      txs: series("2025-01-10", 91, [-2500, -2500, -2500, -2500]),
      expected: {
        intervalDays: 90,
        expectedAmountCents: -2500,
        previousAmountCents: null,
        lastSeenDate: new Date(day("2025-01-10").getTime() + 273 * DAY),
        occurrenceCount: 4,
      },
    },
    {
      name: "monthly with day jitter (28–31) still clusters to 30",
      txs: [
        { date: day("2026-01-31"), amountCents: -1200 },
        { date: day("2026-03-01"), amountCents: -1200 }, // 29
        { date: day("2026-03-31"), amountCents: -1200 }, // 30
        { date: day("2026-04-28"), amountCents: -1200 }, // 28
      ],
      expected: {
        intervalDays: 30,
        expectedAmountCents: -1200,
        previousAmountCents: null,
        lastSeenDate: day("2026-04-28"),
        occurrenceCount: 4,
      },
    },
    {
      name: "one missed payment (a lone ~2× gap) is tolerated",
      txs: [
        { date: day("2026-01-01"), amountCents: -1000 }, // base
        { date: day("2026-01-31"), amountCents: -1000 }, // +30
        { date: day("2026-04-01"), amountCents: -1000 }, // +90 (60d gap, missed +60)
        { date: day("2026-05-01"), amountCents: -1000 }, // +120
        { date: day("2026-05-31"), amountCents: -1000 }, // +150
      ],
      expected: {
        intervalDays: 30,
        expectedAmountCents: -1000,
        previousAmountCents: null,
        lastSeenDate: day("2026-05-31"),
        occurrenceCount: 5,
      },
    },
    {
      name: "price increase: earlier level materially below current",
      txs: series("2025-11-01", 30, [-1000, -1000, -1000, -1500, -1500, -1500]),
      expected: {
        intervalDays: 30,
        expectedAmountCents: -1500,
        previousAmountCents: -1000,
        lastSeenDate: new Date(day("2025-11-01").getTime() + 150 * DAY),
        occurrenceCount: 6,
      },
    },
    {
      name: "unstable recent amount → null (not a clean series)",
      txs: series("2026-01-01", 30, [-1000, -1000, -1000, -1000, -1000, -2000]),
      expected: null,
    },
    {
      name: "biweekly (14d) is not a canonical interval → null",
      txs: series("2026-01-01", 14, [-300, -300, -300, -300, -300, -300]),
      expected: null,
    },
    {
      name: "irregular gaps with no cluster → null",
      txs: [
        { date: day("2026-01-01"), amountCents: -800 },
        { date: day("2026-01-06"), amountCents: -800 },
        { date: day("2026-02-10"), amountCents: -800 },
        { date: day("2026-02-17"), amountCents: -800 },
        { date: day("2026-04-01"), amountCents: -800 },
      ],
      expected: null,
    },
  ];

  it.each(cases)("$name", ({ txs, expected }) => {
    expect(detectRecurrence(txs)).toEqual(expected);
  });
});

describe("intervalLabel", () => {
  it.each([
    { days: 7, expected: "Weekly" },
    { days: 30, expected: "Monthly" },
    { days: 31, expected: "Monthly" },
    { days: 90, expected: "Quarterly" },
    { days: 365, expected: "Yearly" },
    { days: 366, expected: "Yearly" },
  ])("intervalLabel($days) = $expected", ({ days, expected }) => {
    expect(intervalLabel(days)).toBe(expected);
  });
});

describe("nextExpectedDate", () => {
  it("adds one interval, staying on the calendar day", () => {
    expect(nextExpectedDate(day("2026-06-01"), 30)).toEqual(day("2026-07-01"));
    expect(nextExpectedDate(day("2026-06-01"), 7)).toEqual(day("2026-06-08"));
  });
});

describe("monthlyEquivalentCents", () => {
  it.each([
    { cents: -3000, interval: 30, expected: 3042 }, // ~monthly ≈ unchanged
    { cents: -1000, interval: 7, expected: 4345 }, // weekly → ~4.35×
    { cents: -12000, interval: 365, expected: 1000 }, // yearly → /12
    { cents: -500, interval: 0, expected: 0 }, // guard
  ])(
    "monthlyEquivalentCents($cents, $interval) = $expected",
    ({ cents, interval, expected }) => {
      expect(monthlyEquivalentCents(cents, interval)).toBe(expected);
    },
  );
});

describe("subscriptionState", () => {
  const lastSeen = day("2026-01-16");
  it.each([
    { name: "on the due date → active, not missed", now: day("2026-02-15"), active: true, missed: false },
    { name: "within tolerance past due → active, not missed", now: day("2026-02-18"), active: true, missed: false },
    { name: "a few days overdue → active, missed", now: day("2026-02-22"), active: true, missed: true },
    { name: "one interval overdue → active, missed", now: day("2026-03-17"), active: true, missed: true },
    { name: "long overdue (cancelled) → inactive", now: day("2026-04-01"), active: false, missed: false },
  ])("$name", ({ now, active, missed }) => {
    expect(subscriptionState(lastSeen, 30, now)).toEqual({ active, missed });
  });
});
