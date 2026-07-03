import { describe, expect, it } from "vitest";

import {
  clampPercent,
  dateLabel,
  dayHeading,
  dayLabelShort,
  formatHm,
  formatKg,
  formatLastPerformed,
  formatNumber,
  relativeTimeFromNow,
  timeLabel,
} from "./format";

describe("formatHm", () => {
  it("formats minutes as h:mm with a zero-padded minute", () => {
    expect(formatHm(437)).toBe("7:17");
    expect(formatHm(5)).toBe("0:05");
    expect(formatHm(60)).toBe("1:00");
  });

  it("rounds fractional minutes and clamps negatives to 0:00", () => {
    expect(formatHm(59.6)).toBe("1:00");
    expect(formatHm(-10)).toBe("0:00");
  });
});

describe("formatNumber", () => {
  it("drops trailing zeros and groups thousands", () => {
    expect(formatNumber(72.0, 1)).toBe("72");
    expect(formatNumber(1234)).toBe("1,234");
    expect(formatNumber(81.25, 1)).toBe("81.3");
  });
});

describe("formatKg", () => {
  it("renders one decimal with the unit", () => {
    expect(formatKg(81.25)).toBe("81.3 kg");
    expect(formatKg(80)).toBe("80 kg");
  });
});

describe("clampPercent", () => {
  it("computes a clamped percentage of value toward target", () => {
    expect(clampPercent(1250, 2500)).toBe(50);
    expect(clampPercent(3000, 2500)).toBe(100);
    expect(clampPercent(0, 2500)).toBe(0);
  });

  it("returns 0 when the target is non-positive", () => {
    expect(clampPercent(100, 0)).toBe(0);
  });
});

describe("relativeTimeFromNow", () => {
  const now = new Date("2026-06-16T12:00:00.000Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("labels sub-minute and future instants as 'just now'", () => {
    expect(relativeTimeFromNow(ago(30_000), now)).toBe("just now");
    expect(relativeTimeFromNow(ago(-5_000), now)).toBe("just now");
  });

  it("labels minutes up to an hour", () => {
    expect(relativeTimeFromNow(ago(60_000), now)).toBe("1 min ago");
    expect(relativeTimeFromNow(ago(5 * 60_000), now)).toBe("5 min ago");
    expect(relativeTimeFromNow(ago(59 * 60_000), now)).toBe("59 min ago");
  });

  it("labels hours up to a day, flooring", () => {
    expect(relativeTimeFromNow(ago(60 * 60_000), now)).toBe("1 h ago");
    expect(relativeTimeFromNow(ago(90 * 60_000), now)).toBe("1 h ago");
    expect(relativeTimeFromNow(ago(23 * 60 * 60_000), now)).toBe("23 h ago");
  });

  it("labels days beyond 24 hours and accepts ISO strings", () => {
    expect(relativeTimeFromNow(ago(24 * 60 * 60_000), now)).toBe("1 d ago");
    expect(relativeTimeFromNow("2026-06-14T12:00:00.000Z", now)).toBe("2 d ago");
  });
});

describe("formatLastPerformed", () => {
  const today = "2026-06-24";

  it("returns Never for a null day", () => {
    expect(formatLastPerformed(null, today)).toBe("Never");
  });

  it("returns Today for the same (or a future) civil day", () => {
    expect(formatLastPerformed("2026-06-24", today)).toBe("Today");
    expect(formatLastPerformed("2026-06-25", today)).toBe("Today");
  });

  it("returns Yesterday for one day ago", () => {
    expect(formatLastPerformed("2026-06-23", today)).toBe("Yesterday");
  });

  it("returns 'N days ago' from 2 through 6 days", () => {
    expect(formatLastPerformed("2026-06-22", today)).toBe("2 days ago");
    expect(formatLastPerformed("2026-06-19", today)).toBe("5 days ago");
    expect(formatLastPerformed("2026-06-18", today)).toBe("6 days ago");
  });

  it("returns an absolute 'D Mon YYYY' beyond 6 days", () => {
    expect(formatLastPerformed("2026-06-17", today)).toBe("17 Jun 2026");
    expect(formatLastPerformed("2026-02-24", today)).toBe("24 Feb 2026");
  });

  it("handles month/year boundaries without drift", () => {
    expect(formatLastPerformed("2025-12-31", "2026-01-01")).toBe("Yesterday");
    expect(formatLastPerformed("2025-12-25", "2026-01-01")).toBe("25 Dec 2025");
  });
});

describe("dateLabel", () => {
  it("prints the civil day's full weekday label", () => {
    // Local-midnight parse: local midnight of `day` always renders as `day`,
    // so this holds in any test-runner timezone.
    expect(dateLabel("2026-07-02")).toBe("Thursday 2 July");
  });

  it("stays on its own civil date across a year boundary", () => {
    expect(dateLabel("2026-12-31")).toBe("Thursday 31 December");
    expect(dateLabel("2026-01-01")).toBe("Thursday 1 January");
  });
});

describe("dayLabelShort", () => {
  it("prints the compact weekday label for a civil day", () => {
    // Local-midnight parse, like dateLabel: holds in any test-runner timezone.
    expect(dayLabelShort("2026-07-02")).toBe("Thu 2 Jul");
    expect(dayLabelShort("2026-12-31")).toBe("Thu 31 Dec");
  });
});

describe("timeLabel", () => {
  it("prints the wall-clock HH:MM of a local ISO timestamp", () => {
    // Offset-less ISO parses as local time, so the label is zone-independent.
    expect(timeLabel("2026-07-02T18:05:00")).toBe("18:05");
    expect(timeLabel("2026-07-02T09:07:30")).toBe("09:07");
  });

  it("zero-pads the midnight hour", () => {
    expect(timeLabel("2026-07-02T00:03:00")).toBe("00:03");
  });
});

describe("dayHeading", () => {
  it("labels today and yesterday", () => {
    expect(dayHeading("2026-07-02", "2026-07-02")).toBe("Today");
    expect(dayHeading("2026-07-01", "2026-07-02")).toBe("Yesterday");
  });

  it("recognises yesterday across a month boundary", () => {
    expect(dayHeading("2026-06-30", "2026-07-01")).toBe("Yesterday");
    expect(dayHeading("2025-12-31", "2026-01-01")).toBe("Yesterday");
  });

  it("falls back to the full date label for older days", () => {
    expect(dayHeading("2026-06-16", "2026-07-02")).toBe(dateLabel("2026-06-16"));
  });
});
