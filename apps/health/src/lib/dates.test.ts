import { afterEach, describe, expect, it, vi } from "vitest";

import { civilDay, dayOf, dayToDbDate, shiftDay, todayLocal } from "./dates";

describe("dayOf", () => {
  it("buckets a late-evening UTC instant to the next Amsterdam day in summer (CEST, +02:00)", () => {
    expect(dayOf(new Date("2026-06-13T22:30:00Z"))).toBe("2026-06-14");
  });

  it("buckets a late-evening UTC instant to the next Amsterdam day in winter (CET, +01:00)", () => {
    expect(dayOf(new Date("2026-01-13T23:30:00Z"))).toBe("2026-01-14");
  });

  it("keeps an instant before Amsterdam midnight on the same day in winter", () => {
    expect(dayOf(new Date("2026-01-13T22:30:00Z"))).toBe("2026-01-13");
  });

  describe("spring-forward day (2026-03-29, CET → CEST at 01:00 UTC)", () => {
    it("uses +01:00 before the switch", () => {
      expect(dayOf(new Date("2026-03-29T00:30:00Z"))).toBe("2026-03-29");
    });

    it("uses +02:00 after the switch, rolling 22:30Z into the next day", () => {
      expect(dayOf(new Date("2026-03-29T22:30:00Z"))).toBe("2026-03-30");
    });
  });

  describe("fall-back day (2026-10-25, CEST → CET at 01:00 UTC)", () => {
    it("uses +02:00 before the switch", () => {
      expect(dayOf(new Date("2026-10-25T00:30:00Z"))).toBe("2026-10-25");
    });

    it("uses +01:00 after the switch, so 22:30Z stays on the same day", () => {
      expect(dayOf(new Date("2026-10-25T22:30:00Z"))).toBe("2026-10-25");
    });

    it("still rolls past Amsterdam midnight at 23:30Z", () => {
      expect(dayOf(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-26");
    });
  });
});

describe("dayToDbDate", () => {
  it("maps a day to UTC midnight for @db.Date columns", () => {
    expect(dayToDbDate("2026-06-14").toISOString()).toBe(
      "2026-06-14T00:00:00.000Z",
    );
  });
});

describe("shiftDay", () => {
  it("steps back one day", () => {
    expect(shiftDay("2026-06-16", -1)).toBe("2026-06-15");
  });

  it("steps forward one day", () => {
    expect(shiftDay("2026-06-16", 1)).toBe("2026-06-17");
  });

  it("returns the same day for a zero delta", () => {
    expect(shiftDay("2026-06-16", 0)).toBe("2026-06-16");
  });

  it("crosses a month boundary backwards", () => {
    expect(shiftDay("2026-07-01", -1)).toBe("2026-06-30");
  });

  it("crosses a year boundary forwards", () => {
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("steps across the spring-forward DST day without losing a day", () => {
    expect(shiftDay("2026-03-29", -1)).toBe("2026-03-28");
    expect(shiftDay("2026-03-28", 1)).toBe("2026-03-29");
  });
});

describe("todayLocal", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the Amsterdam civil date for the current instant", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T22:30:00Z"));
    expect(todayLocal()).toBe("2026-06-14");
  });
});

describe("civilDay", () => {
  it("is the exact inverse of dayToDbDate", () => {
    expect(civilDay(dayToDbDate("2026-07-02"))).toBe("2026-07-02");
    expect(civilDay(dayToDbDate("2026-01-01"))).toBe("2026-01-01");
  });

  it("slices a non-midnight instant to its UTC date (no timezone shift)", () => {
    expect(civilDay(new Date("2026-06-13T22:30:00Z"))).toBe("2026-06-13");
  });
});
