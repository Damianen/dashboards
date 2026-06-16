import { describe, expect, it } from "vitest";

import { dueAtToInputValues } from "@/lib/dates";

import { firstOccurrence, nextOccurrence } from "./occurrence";
import type { TimeOfDay } from "./rrule";

const TZ = "Europe/Amsterdam";

interface Case {
  name: string;
  rrule: string;
  /** Previous occurrence / threshold; offset-bearing ISO so it's unambiguous. */
  after: string;
  hasDueTime: boolean;
  /** Explicit time-of-day override (else read off `after`). */
  time?: TimeOfDay;
  /** Expected Amsterdam calendar day "YYYY-MM-DD". */
  date: string;
  /** Expected wall-clock "HH:MM", or null for all-day. */
  clock?: string | null;
  /** Optional exact UTC instant — used to prove DST offset shifts. */
  iso?: string;
}

// 2026 Europe/Amsterdam DST: spring-forward Sun 2026-03-29 (02:00->03:00),
// fall-back Sun 2026-10-25 (03:00->02:00). June is CEST (+02:00).
const cases: Case[] = [
  // --- basic stepping --------------------------------------------------------
  {
    name: "daily all-day advances one day",
    rrule: "FREQ=DAILY",
    after: "2026-06-16T00:00:00+02:00",
    hasDueTime: false,
    date: "2026-06-17",
    clock: null,
  },
  {
    name: "every 3 days timed advances 3 days, keeps 18:00",
    rrule: "FREQ=DAILY;INTERVAL=3",
    after: "2026-06-16T18:00:00+02:00",
    hasDueTime: true,
    date: "2026-06-19",
    clock: "18:00",
    iso: "2026-06-19T16:00:00.000Z",
  },
  {
    name: "every monday from a tuesday -> next monday",
    rrule: "FREQ=WEEKLY;BYDAY=MO",
    after: "2026-06-16T00:00:00+02:00",
    hasDueTime: false,
    date: "2026-06-22",
    clock: null,
  },
  {
    name: "MO,WE,FR from monday -> wednesday same week",
    rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
    after: "2026-06-22T00:00:00+02:00",
    hasDueTime: false,
    date: "2026-06-24",
    clock: null,
  },
  {
    name: "every monday timed keeps 09:00",
    rrule: "FREQ=WEEKLY;BYDAY=MO",
    after: "2026-06-22T09:00:00+02:00",
    hasDueTime: true,
    date: "2026-06-29",
    clock: "09:00",
  },
  {
    name: "every 2 weeks advances 14 days",
    rrule: "FREQ=WEEKLY;INTERVAL=2",
    after: "2026-06-16T00:00:00+02:00",
    hasDueTime: false,
    date: "2026-06-30",
    clock: null,
  },
  {
    name: "weekend rule from friday -> saturday",
    rrule: "FREQ=WEEKLY;BYDAY=SA,SU",
    after: "2026-06-19T00:00:00+02:00",
    hasDueTime: false,
    date: "2026-06-20",
    clock: null,
  },

  // --- DST spring-forward (2026-03-29) ---------------------------------------
  {
    name: "daily 18:00 across spring-forward stays 18:00",
    rrule: "FREQ=DAILY",
    after: "2026-03-28T18:00:00+01:00",
    hasDueTime: true,
    date: "2026-03-29",
    clock: "18:00",
    iso: "2026-03-29T16:00:00.000Z",
  },
  {
    name: "weekly 18:00 across spring-forward stays 18:00",
    rrule: "FREQ=WEEKLY",
    after: "2026-03-22T18:00:00+01:00",
    hasDueTime: true,
    date: "2026-03-29",
    clock: "18:00",
    iso: "2026-03-29T16:00:00.000Z",
  },
  {
    name: "daily all-day across spring-forward lands on local midnight",
    rrule: "FREQ=DAILY",
    after: "2026-03-28T00:00:00+01:00",
    hasDueTime: false,
    date: "2026-03-29",
    clock: null,
    iso: "2026-03-28T23:00:00.000Z",
  },
  {
    name: "nonexistent spring-forward time resolves one hour later",
    rrule: "FREQ=DAILY",
    after: "2026-03-28T02:30:00+01:00",
    hasDueTime: true,
    date: "2026-03-29",
    clock: "03:30",
    iso: "2026-03-29T01:30:00.000Z",
  },

  // --- DST fall-back (2026-10-25) --------------------------------------------
  {
    name: "daily 18:00 across fall-back stays 18:00",
    rrule: "FREQ=DAILY",
    after: "2026-10-24T18:00:00+02:00",
    hasDueTime: true,
    date: "2026-10-25",
    clock: "18:00",
    iso: "2026-10-25T17:00:00.000Z",
  },
  {
    name: "daily all-day across fall-back lands on local midnight",
    rrule: "FREQ=DAILY",
    after: "2026-10-24T00:00:00+02:00",
    hasDueTime: false,
    date: "2026-10-25",
    clock: null,
    iso: "2026-10-24T22:00:00.000Z",
  },

  // --- end-of-month / overflow (skip semantics) ------------------------------
  {
    name: "monthly from the 31st skips february",
    rrule: "FREQ=MONTHLY",
    after: "2026-01-31T00:00:00+01:00",
    hasDueTime: false,
    date: "2026-03-31",
    clock: null,
  },
  {
    name: "monthly from the 15th lands next month",
    rrule: "FREQ=MONTHLY",
    after: "2026-01-15T00:00:00+01:00",
    hasDueTime: false,
    date: "2026-02-15",
    clock: null,
  },
  {
    name: "every 3rd friday",
    rrule: "FREQ=MONTHLY;BYDAY=3FR",
    after: "2026-06-01T00:00:00+02:00",
    hasDueTime: false,
    date: "2026-06-19",
    clock: null,
  },
  {
    name: "every last friday",
    rrule: "FREQ=MONTHLY;BYDAY=-1FR",
    after: "2026-06-01T00:00:00+02:00",
    hasDueTime: false,
    date: "2026-06-26",
    clock: null,
  },
  {
    name: "yearly from feb 29 skips to next leap year",
    rrule: "FREQ=YEARLY",
    after: "2024-02-29T00:00:00+01:00",
    hasDueTime: false,
    date: "2028-02-29",
    clock: null,
  },

  // --- from-due vs from-completion -------------------------------------------
  {
    name: "from-due: every 3 days all-day advances 3 days",
    rrule: "FREQ=DAILY;INTERVAL=3",
    after: "2026-06-16T00:00:00+02:00",
    hasDueTime: false,
    date: "2026-06-19",
    clock: null,
  },
  {
    name: "from-completion: 3 days after a late complete (end of day)",
    rrule: "FREQ=DAILY;INTERVAL=3",
    after: "2026-06-20T23:59:59.999+02:00",
    hasDueTime: true,
    time: { hour: 18, minute: 0 },
    date: "2026-06-23",
    clock: "18:00",
  },
];

describe("nextOccurrence", () => {
  it.each(cases)("$name", (c) => {
    const result = nextOccurrence(
      c.rrule,
      new Date(c.after),
      TZ,
      c.hasDueTime,
      c.time,
    );
    expect(result).not.toBeNull();
    const values = dueAtToInputValues(result!, c.hasDueTime, TZ);
    expect(values.date).toBe(c.date);
    expect(values.time).toBe(c.clock ?? null);
    if (c.iso) expect(result!.toISOString()).toBe(c.iso);
  });
});

describe("firstOccurrence", () => {
  it("all-day daily created mid-day is due today", () => {
    const now = new Date("2026-06-16T14:00:00+02:00");
    const r = firstOccurrence("FREQ=DAILY", now, TZ, false);
    expect(dueAtToInputValues(r!, false, TZ).date).toBe("2026-06-16");
  });

  it("all-day every-3-days starts today (phase anchored on creation)", () => {
    const now = new Date("2026-06-16T14:00:00+02:00");
    const r = firstOccurrence("FREQ=DAILY;INTERVAL=3", now, TZ, false);
    expect(dueAtToInputValues(r!, false, TZ).date).toBe("2026-06-16");
  });

  it("timed rule whose time already passed today rolls forward", () => {
    const now = new Date("2026-06-16T20:00:00+02:00");
    const r = firstOccurrence("FREQ=DAILY", now, TZ, true, { hour: 18, minute: 0 });
    const v = dueAtToInputValues(r!, true, TZ);
    expect(v.date).toBe("2026-06-17");
    expect(v.time).toBe("18:00");
  });

  it("timed rule whose time is still ahead today fires today", () => {
    const now = new Date("2026-06-16T10:00:00+02:00");
    const r = firstOccurrence("FREQ=DAILY", now, TZ, true, { hour: 18, minute: 0 });
    const v = dueAtToInputValues(r!, true, TZ);
    expect(v.date).toBe("2026-06-16");
    expect(v.time).toBe("18:00");
  });

  it("every monday created on a tuesday is due next monday", () => {
    const now = new Date("2026-06-16T10:00:00+02:00"); // Tuesday
    const r = firstOccurrence("FREQ=WEEKLY;BYDAY=MO", now, TZ, false);
    expect(dueAtToInputValues(r!, false, TZ).date).toBe("2026-06-22");
  });
});
