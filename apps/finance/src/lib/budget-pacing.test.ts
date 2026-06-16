import { describe, expect, it } from "vitest";

import {
  budgetDedupeKey,
  budgetProgress,
  crossedThresholds,
  daysInMonth,
  monthElapsedFraction,
  unsentKeys,
  type BudgetStatus,
} from "@/lib/budget-pacing";
import { zonedDateString } from "@/lib/dates";

// All instants are chosen so the Amsterdam calendar day is unambiguous.
// June 2026 = CEST (+2); the DST transitions are 2026-03-29 (spring forward)
// and 2026-10-25 (fall back).

describe("daysInMonth", () => {
  const cases: { name: string; now: string; days: number }[] = [
    { name: "June has 30", now: "2026-06-16T09:00:00Z", days: 30 },
    { name: "July has 31", now: "2026-07-31T09:00:00Z", days: 31 },
    { name: "Feb non-leap has 28", now: "2026-02-28T09:00:00Z", days: 28 },
    { name: "Feb leap has 29", now: "2028-02-10T09:00:00Z", days: 29 },
    { name: "March (spring-forward month) has 31", now: "2026-03-29T09:00:00Z", days: 31 },
    { name: "October (fall-back month) has 31", now: "2026-10-25T09:00:00Z", days: 31 },
  ];
  it.each(cases)("$name", ({ now, days }) => {
    expect(daysInMonth(new Date(now))).toBe(days);
  });
});

describe("monthElapsedFraction", () => {
  const cases: { name: string; now: string; expected: number }[] = [
    { name: "day 1 of 30-day month", now: "2026-06-01T09:00:00Z", expected: 1 / 30 },
    { name: "mid-month", now: "2026-06-16T09:00:00Z", expected: 16 / 30 },
    { name: "last day of 30-day month", now: "2026-06-30T09:00:00Z", expected: 1 },
    { name: "last day of 31-day month", now: "2026-07-31T09:00:00Z", expected: 1 },
    { name: "Feb non-leap last day", now: "2026-02-28T09:00:00Z", expected: 1 },
    { name: "late-evening still day 1 (23:00 CEST)", now: "2026-06-01T21:00:00Z", expected: 1 / 30 },
    { name: "spring-forward month day 1", now: "2026-03-01T09:00:00Z", expected: 1 / 31 },
    { name: "spring-forward day itself", now: "2026-03-29T09:00:00Z", expected: 29 / 31 },
    { name: "fall-back day itself", now: "2026-10-25T09:00:00Z", expected: 25 / 31 },
    { name: "23:30Z rolls into next Amsterdam day", now: "2026-06-15T23:30:00Z", expected: 16 / 30 },
  ];
  it.each(cases)("$name", ({ now, expected }) => {
    expect(monthElapsedFraction(new Date(now))).toBeCloseTo(expected, 10);
  });
});

describe("budgetProgress", () => {
  const cases: {
    name: string;
    spent: number;
    limit: number;
    now: string;
    spentFraction: number;
    status: BudgetStatus;
    projected?: number;
  }[] = [
    {
      name: "under and behind pace",
      spent: 100, limit: 300, now: "2026-06-16T09:00:00Z",
      spentFraction: 1 / 3, status: "under", projected: 187.5,
    },
    {
      name: "ahead of pace but not over",
      spent: 200, limit: 300, now: "2026-06-16T09:00:00Z",
      spentFraction: 2 / 3, status: "on", projected: 375,
    },
    {
      name: "over budget",
      spent: 312, limit: 300, now: "2026-06-16T09:00:00Z",
      spentFraction: 1.04, status: "over",
    },
    {
      name: "exactly at limit is over",
      spent: 300, limit: 300, now: "2026-06-16T09:00:00Z",
      spentFraction: 1, status: "over",
    },
    {
      name: "zero spend on day 1 is under",
      spent: 0, limit: 300, now: "2026-06-01T09:00:00Z",
      spentFraction: 0, status: "under", projected: 0,
    },
    {
      name: "zero-limit guard, no spend → under",
      spent: 0, limit: 0, now: "2026-06-16T09:00:00Z",
      spentFraction: 0, status: "under", projected: 0,
    },
    {
      name: "zero-limit guard, with spend → over",
      spent: 50, limit: 0, now: "2026-06-16T09:00:00Z",
      spentFraction: 0, status: "over", projected: 0,
    },
    {
      name: "last day, 5/6 spent, full pace → under",
      spent: 250, limit: 300, now: "2026-06-30T09:00:00Z",
      spentFraction: 5 / 6, status: "under", projected: 250,
    },
  ];
  it.each(cases)("$name", ({ spent, limit, now, spentFraction, status, projected }) => {
    const p = budgetProgress(spent, limit, new Date(now));
    expect(p.spentFraction).toBeCloseTo(spentFraction, 10);
    expect(p.status).toBe(status);
    if (projected !== undefined) expect(p.projected).toBeCloseTo(projected, 6);
  });
});

describe("crossedThresholds", () => {
  const cases: { name: string; spent: number; limit: number; expected: (80 | 100)[] }[] = [
    { name: "79% → none", spent: 79, limit: 100, expected: [] },
    { name: "exactly 80% → [80]", spent: 80, limit: 100, expected: [80] },
    { name: "239.99/300 just under 80% → none", spent: 239.99, limit: 300, expected: [] },
    { name: "240.00/300 exactly 80% → [80]", spent: 240, limit: 300, expected: [80] },
    { name: "99% → [80]", spent: 99, limit: 100, expected: [80] },
    { name: "exactly 100% → [80,100]", spent: 100, limit: 100, expected: [80, 100] },
    { name: "over 100% → [80,100]", spent: 130, limit: 100, expected: [80, 100] },
    { name: "zero limit → []", spent: 50, limit: 0, expected: [] },
    { name: "negative limit guard → []", spent: 50, limit: -10, expected: [] },
  ];
  it.each(cases)("$name", ({ spent, limit, expected }) => {
    expect(crossedThresholds(spent, limit)).toEqual(expected);
  });
});

describe("budgetDedupeKey", () => {
  it("formats id:YYYY-MM:threshold", () => {
    expect(budgetDedupeKey("bud1", "2026-06", 80)).toBe("bud1:2026-06:80");
    expect(budgetDedupeKey("bud1", "2026-06", 100)).toBe("bud1:2026-06:100");
  });

  // The service derives monthKey from the stored Budget.month (UTC-midnight of
  // the first-of-month). Assert that derivation is DST-correct in Amsterdam.
  const months: { stored: string; expected: string }[] = [
    { stored: "2026-06-01T00:00:00Z", expected: "2026-06" },
    { stored: "2026-03-01T00:00:00Z", expected: "2026-03" }, // CET
    { stored: "2026-10-01T00:00:00Z", expected: "2026-10" }, // CEST
    { stored: "2026-01-01T00:00:00Z", expected: "2026-01" },
  ];
  it.each(months)("monthKey of $stored is $expected", ({ stored, expected }) => {
    const monthKey = zonedDateString(new Date(stored)).slice(0, 7);
    expect(budgetDedupeKey("b", monthKey, 100)).toBe(`b:${expected}:100`);
  });
});

describe("unsentKeys", () => {
  const cases: { name: string; candidates: string[]; sent: string[]; expected: string[] }[] = [
    { name: "all new", candidates: ["a", "b"], sent: [], expected: ["a", "b"] },
    { name: "one already sent", candidates: ["a", "b"], sent: ["a"], expected: ["b"] },
    { name: "all sent", candidates: ["a", "b"], sent: ["a", "b"], expected: [] },
    { name: "order preserved", candidates: ["b", "a"], sent: [], expected: ["b", "a"] },
  ];
  it.each(cases)("$name", ({ candidates, sent, expected }) => {
    expect(unsentKeys(candidates, sent)).toEqual(expected);
  });
});
