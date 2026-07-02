import { describe, expect, it } from "vitest";

import {
  e1rmHistoryQuerySchema,
  finishSessionSchema,
  historyQuerySchema,
  logSetSchema,
  muscleVolumeQuerySchema,
  sessionsQuerySchema,
  updateSetSchema,
} from "./lifting";

const CUID = "cflx0a1b2c3d4e5f6g7h8i9j";

describe("logSetSchema exactly-one-of exercise reference", () => {
  const set = { reps: 8, weightKg: 60 };

  it("rejects both exerciseId and exerciseName", () => {
    expect(
      logSetSchema.safeParse({
        ...set,
        exerciseId: CUID,
        exerciseName: "Squat",
      }).success,
    ).toBe(false);
  });

  it("rejects neither", () => {
    expect(logSetSchema.safeParse(set).success).toBe(false);
  });

  it("accepts exerciseId alone", () => {
    expect(logSetSchema.safeParse({ ...set, exerciseId: CUID }).success).toBe(
      true,
    );
  });

  it("accepts exerciseName alone", () => {
    expect(
      logSetSchema.safeParse({ ...set, exerciseName: "Squat" }).success,
    ).toBe(true);
  });
});

describe("logSetSchema reps bounds and isWarmup default", () => {
  const base = { exerciseName: "Squat", weightKg: 60 };

  it("requires integer reps within [1, 100]", () => {
    expect(logSetSchema.safeParse({ ...base, reps: 0 }).success).toBe(false);
    expect(logSetSchema.safeParse({ ...base, reps: 101 }).success).toBe(false);
    expect(logSetSchema.safeParse({ ...base, reps: 7.5 }).success).toBe(false);
    expect(logSetSchema.safeParse({ ...base, reps: 100 }).success).toBe(true);
  });

  it("defaults isWarmup to false in the parse output", () => {
    const r = logSetSchema.parse({ ...base, reps: 8 });
    expect(r.isWarmup).toBe(false);
  });
});

describe("updateSetSchema", () => {
  it("rejects an empty object (at-least-one-field refine)", () => {
    expect(updateSetSchema.safeParse({}).success).toBe(false);
  });

  it("accepts { rpe: null } as clear-RPE and preserves the null", () => {
    const r = updateSetSchema.safeParse({ rpe: null });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.rpe).toBeNull();
    }
  });

  it("rejects rpe out of [1, 10]", () => {
    expect(updateSetSchema.safeParse({ rpe: 0.5 }).success).toBe(false);
    expect(updateSetSchema.safeParse({ rpe: 10.5 }).success).toBe(false);
  });

  it("accepts a single-field edit", () => {
    expect(updateSetSchema.safeParse({ reps: 5 }).success).toBe(true);
  });
});

describe("query schemas: coercion and defaults", () => {
  it("historyQuerySchema coerces limit and defaults it to 10", () => {
    const coerced = historyQuerySchema.parse({ exercise: "squat", limit: "25" });
    expect(coerced.limit).toBe(25);
    expect(historyQuerySchema.parse({ exercise: "squat" }).limit).toBe(10);
    expect(
      historyQuerySchema.safeParse({ exercise: "squat", limit: "101" })
        .success,
    ).toBe(false);
  });

  it("sessionsQuerySchema allows omitting day and defaults limit to 10", () => {
    const r = sessionsQuerySchema.parse({});
    expect(r.day).toBeUndefined();
    expect(r.limit).toBe(10);
    expect(
      sessionsQuerySchema.parse({ day: "2026-07-02", limit: "5" }).limit,
    ).toBe(5);
    expect(sessionsQuerySchema.safeParse({ day: "2026-7-2" }).success).toBe(
      false,
    );
  });

  it("e1rmHistoryQuerySchema coerces days and defaults to 90", () => {
    expect(e1rmHistoryQuerySchema.parse({ exercise: "bench" }).days).toBe(90);
    expect(
      e1rmHistoryQuerySchema.parse({ exercise: "bench", days: "30" }).days,
    ).toBe(30);
    expect(
      e1rmHistoryQuerySchema.safeParse({ exercise: "bench", days: "366" })
        .success,
    ).toBe(false);
  });

  it("muscleVolumeQuerySchema coerces weeks and defaults to 12", () => {
    expect(muscleVolumeQuerySchema.parse({}).weeks).toBe(12);
    expect(muscleVolumeQuerySchema.parse({ weeks: "8" }).weeks).toBe(8);
    expect(muscleVolumeQuerySchema.safeParse({ weeks: "53" }).success).toBe(
      false,
    );
  });
});

describe("finishSessionSchema", () => {
  it("defaults a bare body to finish (back-compat with the old route)", () => {
    expect(finishSessionSchema.parse({})).toEqual({ finished: true });
  });

  it("accepts an explicit reopen", () => {
    expect(finishSessionSchema.parse({ finished: false })).toEqual({
      finished: false,
    });
  });

  it("is strict and boolean-only", () => {
    expect(finishSessionSchema.safeParse({ finished: "no" }).success).toBe(false);
    expect(finishSessionSchema.safeParse({ finished: true, x: 1 }).success).toBe(
      false,
    );
  });
});
