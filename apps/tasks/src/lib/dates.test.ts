import { describe, expect, it } from "vitest";

import {
  addDaysToDayStart,
  dueAtToInputValues,
  formatDayHeading,
  formatDueChip,
  inputValuesToDueAt,
  isOverdue,
  isValidDueIso,
  isValidTimeZone,
  localDayKey,
  normalizeDueAt,
  parseDueIso,
  todayWindow,
  upcomingWindow,
  wallTimeToInstant,
  zonedDayStart,
} from "./dates";

const AMS = "Europe/Amsterdam";

describe("isValidTimeZone", () => {
  it("accepts IANA names", () => {
    expect(isValidTimeZone("Europe/Amsterdam")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects garbage", () => {
    expect(isValidTimeZone("Nope/Nope")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("zonedDayStart", () => {
  it("floors a normal CEST day to 22:00 UTC the previous day", () => {
    expect(
      zonedDayStart(new Date("2026-06-13T12:00:00Z"), AMS).toISOString(),
    ).toBe("2026-06-12T22:00:00.000Z");
  });

  it("uses the CET offset at midnight on the spring-forward day", () => {
    // 2026-03-29: clocks jump 02:00 -> 03:00; midnight itself is still CET.
    expect(
      zonedDayStart(new Date("2026-03-29T12:00:00Z"), AMS).toISOString(),
    ).toBe("2026-03-28T23:00:00.000Z");
  });

  it("uses the CEST offset at midnight on the fall-back day", () => {
    // 2026-10-25: clocks fall back 03:00 -> 02:00; midnight is still CEST.
    expect(
      zonedDayStart(new Date("2026-10-25T12:00:00Z"), AMS).toISOString(),
    ).toBe("2026-10-24T22:00:00.000Z");
  });

  it("passes through UTC", () => {
    expect(
      zonedDayStart(new Date("2026-06-13T12:34:56Z"), "UTC").toISOString(),
    ).toBe("2026-06-13T00:00:00.000Z");
  });

  it("is idempotent", () => {
    const start = zonedDayStart(new Date("2026-06-13T12:00:00Z"), AMS);
    expect(zonedDayStart(start, AMS).toISOString()).toBe(start.toISOString());
  });
});

describe("addDaysToDayStart", () => {
  it("spans 23 hours across spring-forward", () => {
    const before = zonedDayStart(new Date("2026-03-29T12:00:00Z"), AMS);
    const after = addDaysToDayStart(before, 1, AMS);
    expect(after.getTime() - before.getTime()).toBe(23 * 3_600_000);
    expect(after.toISOString()).toBe("2026-03-29T22:00:00.000Z");
  });

  it("spans 25 hours across fall-back", () => {
    const before = zonedDayStart(new Date("2026-10-25T12:00:00Z"), AMS);
    const after = addDaysToDayStart(before, 1, AMS);
    expect(after.getTime() - before.getTime()).toBe(25 * 3_600_000);
    expect(after.toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });

  it("adds plain days away from transitions", () => {
    const start = zonedDayStart(new Date("2026-06-13T12:00:00Z"), AMS);
    expect(addDaysToDayStart(start, 7, AMS).toISOString()).toBe(
      "2026-06-19T22:00:00.000Z",
    );
  });
});

describe("todayWindow / upcomingWindow", () => {
  const now = new Date("2026-06-13T09:30:00Z");

  it("today spans exactly one local day", () => {
    const { start, end } = todayWindow(AMS, now);
    expect(start.toISOString()).toBe("2026-06-12T22:00:00.000Z");
    expect(end.toISOString()).toBe("2026-06-13T22:00:00.000Z");
    expect(end.toISOString()).toBe(
      addDaysToDayStart(start, 1, AMS).toISOString(),
    );
  });

  it("upcoming(7) starts tomorrow and spans 7 local days", () => {
    const { start, end } = upcomingWindow(7, AMS, now);
    expect(start.toISOString()).toBe("2026-06-13T22:00:00.000Z");
    expect(end.toISOString()).toBe("2026-06-20T22:00:00.000Z");
  });

  it("upcoming abuts today's window with no gap", () => {
    expect(upcomingWindow(7, AMS, now).start.toISOString()).toBe(
      todayWindow(AMS, now).end.toISOString(),
    );
  });
});

describe("normalizeDueAt", () => {
  it("snaps all-day dues to local midnight", () => {
    expect(
      normalizeDueAt(new Date("2026-06-13T15:45:00Z"), false, AMS).toISOString(),
    ).toBe("2026-06-12T22:00:00.000Z");
  });

  it("passes timed dues through unchanged", () => {
    const due = new Date("2026-06-13T15:45:00Z");
    expect(normalizeDueAt(due, true, AMS).toISOString()).toBe(
      due.toISOString(),
    );
  });
});

describe("localDayKey", () => {
  it("uses the local calendar day across the UTC midnight boundary", () => {
    // 22:30Z on the 12th is already 00:30 on the 13th in CEST.
    expect(localDayKey(new Date("2026-06-12T22:30:00Z"), AMS)).toBe(
      "2026-06-13",
    );
    expect(localDayKey(new Date("2026-06-12T21:30:00Z"), AMS)).toBe(
      "2026-06-12",
    );
  });
});

describe("isOverdue", () => {
  // 11:30 local on Sat 2026-06-13 (CEST); local day starts 22:00Z on the 12th.
  const now = new Date("2026-06-13T09:30:00Z");

  it("is never overdue without a due date", () => {
    expect(isOverdue(null, false, AMS, now)).toBe(false);
    expect(isOverdue(null, true, AMS, now)).toBe(false);
  });

  it("compares timed tasks against the exact instant", () => {
    expect(isOverdue(new Date("2026-06-13T09:00:00Z"), true, AMS, now)).toBe(
      true,
    );
    expect(isOverdue(new Date("2026-06-13T10:00:00Z"), true, AMS, now)).toBe(
      false,
    );
    // Exactly now is not yet overdue.
    expect(isOverdue(now, true, AMS, now)).toBe(false);
  });

  it("compares all-day tasks against the local day start", () => {
    // Due today (local midnight = 22:00Z on the 12th) is not overdue.
    expect(
      isOverdue(new Date("2026-06-12T22:00:00Z"), false, AMS, now),
    ).toBe(false);
    // Due yesterday is overdue.
    expect(
      isOverdue(new Date("2026-06-11T22:00:00Z"), false, AMS, now),
    ).toBe(true);
  });
});

describe("formatDueChip", () => {
  const now = new Date("2026-06-13T09:30:00Z"); // Sat 2026-06-13, CEST

  const allDay = (key: string) =>
    formatDueChip(zonedDayStart(new Date(`${key}T12:00:00Z`), AMS), false, AMS, now);

  it("labels today and tomorrow", () => {
    expect(allDay("2026-06-13")).toBe("Today");
    expect(allDay("2026-06-14")).toBe("Tomorrow");
  });

  it("uses the weekday within the next six days", () => {
    expect(allDay("2026-06-15")).toBe("Mon");
    expect(allDay("2026-06-19")).toBe("Fri");
  });

  it("uses day + month beyond six days, dropping a matching year", () => {
    expect(allDay("2026-06-20")).toBe("20 Jun");
  });

  it("includes the year when it differs", () => {
    expect(allDay("2027-01-02")).toBe("2 Jan 2027");
  });

  it("appends the wall-clock time for timed tasks", () => {
    // 12:30Z is 14:30 local in CEST.
    expect(
      formatDueChip(new Date("2026-06-13T12:30:00Z"), true, AMS, now),
    ).toBe("Today 14:30");
  });
});

describe("formatDayHeading", () => {
  const now = new Date("2026-06-13T09:30:00Z"); // Sat 2026-06-13

  const heading = (key: string) =>
    formatDayHeading(zonedDayStart(new Date(`${key}T12:00:00Z`), AMS), AMS, now);

  it("labels today and tomorrow, then full weekdays", () => {
    expect(heading("2026-06-13")).toBe("Today");
    expect(heading("2026-06-14")).toBe("Tomorrow");
    expect(heading("2026-06-15")).toBe("Monday");
  });

  it("uses weekday + day + month beyond six days", () => {
    expect(heading("2026-06-20")).toBe("Sat 20 Jun");
  });

  it("includes the year when it differs", () => {
    expect(heading("2027-01-02")).toBe("Sat 2 Jan 2027");
  });
});

describe("wallTimeToInstant", () => {
  it("resolves a winter (CET) wall time", () => {
    expect(
      wallTimeToInstant(
        { year: 2026, month: 1, day: 15, hour: 9, minute: 0 },
        AMS,
      ).toISOString(),
    ).toBe("2026-01-15T08:00:00.000Z");
  });

  it("resolves a summer (CEST) wall time", () => {
    expect(
      wallTimeToInstant(
        { year: 2026, month: 6, day: 13, hour: 14, minute: 30 },
        AMS,
      ).toISOString(),
    ).toBe("2026-06-13T12:30:00.000Z");
  });

  it("treats a missing time as local midnight, matching zonedDayStart", () => {
    expect(
      wallTimeToInstant({ year: 2026, month: 6, day: 13 }, AMS).toISOString(),
    ).toBe(zonedDayStart(new Date("2026-06-13T12:00:00Z"), AMS).toISOString());
  });

  it("pushes a nonexistent spring-forward time one hour later", () => {
    // 2026-03-29 02:30 does not exist; it resolves to 03:30 local = 01:30Z.
    expect(
      wallTimeToInstant(
        { year: 2026, month: 3, day: 29, hour: 2, minute: 30 },
        AMS,
      ).toISOString(),
    ).toBe("2026-03-29T01:30:00.000Z");
  });
});

describe("parseDueIso", () => {
  it("treats a bare date as all-day local midnight", () => {
    expect(parseDueIso("2026-06-20", AMS)).toEqual({
      dueAt: new Date("2026-06-19T22:00:00Z"),
      hasDueTime: false,
    });
  });

  it("treats an offset-less datetime as wall-clock in the zone", () => {
    expect(parseDueIso("2026-06-20T14:30", AMS)).toEqual({
      dueAt: new Date("2026-06-20T12:30:00Z"),
      hasDueTime: true,
    });
    // Seconds are allowed and ignored for the wall-clock reading.
    expect(parseDueIso("2026-06-20T14:30:00", AMS).dueAt.toISOString()).toBe(
      "2026-06-20T12:30:00.000Z",
    );
  });

  it("treats a Z / offset datetime as an absolute instant", () => {
    expect(parseDueIso("2026-06-20T12:30:00Z", AMS)).toEqual({
      dueAt: new Date("2026-06-20T12:30:00Z"),
      hasDueTime: true,
    });
    expect(
      parseDueIso("2026-06-20T14:30:00+02:00", AMS).dueAt.toISOString(),
    ).toBe("2026-06-20T12:30:00.000Z");
  });

  it("defaults to Europe/Amsterdam when no zone is passed", () => {
    expect(parseDueIso("2026-06-20").dueAt.toISOString()).toBe(
      "2026-06-19T22:00:00.000Z",
    );
  });

  it("throws on unparseable input, and isValidDueIso mirrors it", () => {
    expect(() => parseDueIso("not-a-date", AMS)).toThrow();
    expect(isValidDueIso("not-a-date")).toBe(false);
    expect(isValidDueIso("2026-06-20")).toBe(true);
    expect(isValidDueIso("2026-06-20T14:30")).toBe(true);
  });
});

describe("dueAt <-> input values round-trip", () => {
  it("splits a timed due into date + time fields", () => {
    expect(
      dueAtToInputValues(new Date("2026-06-13T12:30:00Z"), true, AMS),
    ).toEqual({ date: "2026-06-13", time: "14:30" });
  });

  it("splits an all-day due into a date with no time", () => {
    expect(
      dueAtToInputValues(new Date("2026-06-12T22:00:00Z"), false, AMS),
    ).toEqual({ date: "2026-06-13", time: null });
  });

  it("rebuilds a timed due from inputs", () => {
    expect(inputValuesToDueAt("2026-06-13", "14:30", AMS)).toEqual({
      dueAt: new Date("2026-06-13T12:30:00Z"),
      hasDueTime: true,
    });
  });

  it("treats an empty or missing time as all-day", () => {
    expect(inputValuesToDueAt("2026-06-13", "", AMS)).toEqual({
      dueAt: new Date("2026-06-12T22:00:00Z"),
      hasDueTime: false,
    });
    expect(inputValuesToDueAt("2026-06-13", null, AMS)).toEqual({
      dueAt: new Date("2026-06-12T22:00:00Z"),
      hasDueTime: false,
    });
  });

  it("round-trips a timed due through both directions", () => {
    const dueAt = new Date("2026-06-13T12:30:00Z");
    const { date, time } = dueAtToInputValues(dueAt, true, AMS);
    expect(inputValuesToDueAt(date, time, AMS).dueAt.toISOString()).toBe(
      dueAt.toISOString(),
    );
  });
});
