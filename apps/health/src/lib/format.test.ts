import { describe, expect, it } from "vitest";

import { clampPercent, formatHm, formatKg, formatNumber } from "./format";

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
