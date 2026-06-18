import { describe, expect, it } from "vitest";

import {
  clampPercent,
  formatHm,
  formatKg,
  formatNumber,
  relativeTimeFromNow,
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
