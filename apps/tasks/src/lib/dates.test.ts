import { describe, expect, it } from "vitest";

import {
  addDaysToDayStart,
  isValidTimeZone,
  normalizeDueAt,
  todayWindow,
  upcomingWindow,
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
