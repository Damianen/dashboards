import { describe, expect, it } from "vitest";

import {
  observationHistoryQuerySchema,
  observationsWindowSchema,
  weeklyReviewQuerySchema,
} from "./insights";

describe("observationHistoryQuerySchema", () => {
  it("defaults the limit to 20 and coerces strings", () => {
    expect(observationHistoryQuerySchema.parse({}).limit).toBe(20);
    expect(observationHistoryQuerySchema.parse({ limit: "5" }).limit).toBe(5);
  });

  it("bounds the limit to 1–100", () => {
    expect(observationHistoryQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(observationHistoryQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });
});

describe("weeklyReviewQuerySchema", () => {
  it("accepts any civil day — not just Mondays (the service normalizes)", () => {
    expect(weeklyReviewQuerySchema.parse({ weekStart: "2026-06-18" })).toEqual({
      weekStart: "2026-06-18",
    });
  });

  it("allows weekStart to be omitted (defaults to the current week downstream)", () => {
    expect(weeklyReviewQuerySchema.parse({})).toEqual({});
  });

  it("rejects malformed dates and unknown keys", () => {
    expect(weeklyReviewQuerySchema.safeParse({ weekStart: "18-06-2026" }).success).toBe(
      false,
    );
    expect(weeklyReviewQuerySchema.safeParse({ weekStart: "next week" }).success).toBe(
      false,
    );
    expect(weeklyReviewQuerySchema.safeParse({ week: "2026-06-18" }).success).toBe(
      false,
    );
  });
});

describe("observationsWindowSchema", () => {
  it("still rejects windows under 14 days — a deliberate floor, not an oversight: " +
     "detectors need MIN_PAIRED_DAYS (8) lagged pairs, so a 7-day window can never " +
     "produce an observation (why the UI selector starts at 14, not 7)", () => {
    expect(observationsWindowSchema.safeParse(7).success).toBe(false);
    expect(observationsWindowSchema.safeParse(13).success).toBe(false);
    expect(observationsWindowSchema.safeParse(14).success).toBe(true);
    expect(observationsWindowSchema.safeParse(90).success).toBe(true);
  });
});
