import { describe, expect, it } from "vitest";

import {
  formatRest,
  remainingSec,
  restEndsAt,
  restFraction,
} from "./rest-timer";

const T0 = Date.parse("2026-07-04T10:00:00.000Z");

describe("restEndsAt", () => {
  it("adds the planned rest (in ms) to the log instant", () => {
    expect(restEndsAt(T0, 90)).toBe(T0 + 90_000);
    expect(restEndsAt(T0, 1)).toBe(T0 + 1_000);
  });
});

describe("remainingSec", () => {
  const endsAt = restEndsAt(T0, 90);

  it("reads the full rest at the log instant", () => {
    expect(remainingSec(endsAt, T0)).toBe(90);
  });

  it("rounds partial seconds UP so the display never skips ahead", () => {
    expect(remainingSec(endsAt, endsAt - 1)).toBe(1);
    expect(remainingSec(endsAt, endsAt - 999)).toBe(1);
    expect(remainingSec(endsAt, endsAt - 1_001)).toBe(2);
    expect(remainingSec(endsAt, T0 + 500)).toBe(90);
  });

  it("hits exactly 0 at the deadline", () => {
    expect(remainingSec(endsAt, endsAt)).toBe(0);
  });

  it("clamps at 0 after the deadline, never negative", () => {
    expect(remainingSec(endsAt, endsAt + 1)).toBe(0);
    expect(remainingSec(endsAt, endsAt + 3_600_000)).toBe(0);
  });
});

describe("formatRest", () => {
  it("formats m:ss with zero-padded seconds", () => {
    expect(formatRest(0)).toBe("0:00");
    expect(formatRest(59)).toBe("0:59");
    expect(formatRest(60)).toBe("1:00");
    expect(formatRest(90)).toBe("1:30");
    expect(formatRest(3600)).toBe("60:00");
  });
});

describe("restFraction", () => {
  it("spans 1 (untouched) down to 0 (elapsed)", () => {
    expect(restFraction(90, 90)).toBe(1);
    expect(restFraction(90, 45)).toBe(0.5);
    expect(restFraction(90, 0)).toBe(0);
  });

  it("clamps out-of-range remainders to the 0..1 bounds", () => {
    expect(restFraction(90, 120)).toBe(1);
    expect(restFraction(90, -5)).toBe(0);
  });

  it("treats a non-positive total as fully elapsed (no division blow-up)", () => {
    expect(restFraction(0, 0)).toBe(0);
    expect(restFraction(0, 30)).toBe(0);
  });
});

describe("wall-clock correctness across a background gap", () => {
  it("a 5-minute gap mid-rest lands the countdown exactly on wall time", () => {
    // 10-minute rest; the app ticks normally for 30 s…
    const endsAt = restEndsAt(T0, 600);
    expect(remainingSec(endsAt, T0 + 30_000)).toBe(570);
    // …then the phone is pocketed and NO ticks fire for 5 minutes. The first
    // tick after waking derives from endsAt − now, so it reads 600 − 330 s —
    // as if every intermediate tick had fired.
    const wakeAt = T0 + 30_000 + 300_000;
    expect(remainingSec(endsAt, wakeAt)).toBe(270);
    expect(restFraction(600, remainingSec(endsAt, wakeAt))).toBe(0.45);
  });

  it("a rest that expired entirely inside the gap wakes up at 0, clamped", () => {
    // 90-second rest, backgrounded 10 s in, awake 5 minutes later.
    const endsAt = restEndsAt(T0, 90);
    expect(remainingSec(endsAt, T0 + 10_000)).toBe(80);
    expect(remainingSec(endsAt, T0 + 10_000 + 300_000)).toBe(0);
    expect(restFraction(90, 0)).toBe(0);
  });
});
