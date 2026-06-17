import { describe, expect, it } from "vitest";

import {
  addDaysToDayStart,
  isValidTimeZone,
  zonedDateString,
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

  it("subtracts plain days away from transitions", () => {
    const start = zonedDayStart(new Date("2026-06-13T12:00:00Z"), AMS);
    expect(addDaysToDayStart(start, -3, AMS).toISOString()).toBe(
      "2026-06-09T22:00:00.000Z",
    );
  });
});

describe("zonedDateString", () => {
  it("returns the local calendar day, not the UTC one", () => {
    // 23:30 UTC on 2026-06-13 is already 01:30 on the 14th in Amsterdam.
    expect(zonedDateString(new Date("2026-06-13T23:30:00Z"), AMS)).toBe(
      "2026-06-14",
    );
  });

  it("pads month and day", () => {
    expect(zonedDateString(new Date("2026-01-05T12:00:00Z"), AMS)).toBe(
      "2026-01-05",
    );
  });

  it("defaults to Europe/Amsterdam", () => {
    expect(zonedDateString(new Date("2026-06-13T12:00:00Z"))).toBe("2026-06-13");
  });
});
