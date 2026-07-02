import { describe, expect, it } from "vitest";

import {
  createTemplateSchema,
  templateExerciseInputSchema,
  templateTargetSchema,
  warmupSetInputSchema,
} from "./template";

const CUID = "cflx0a1b2c3d4e5f6g7h8i9j";

const repsTarget = {
  targetType: "REPS",
  targetSets: 4,
  repMin: 6,
  repMax: 10,
} as const;

describe("templateTargetSchema REPS branch", () => {
  it("rejects repMin > repMax with the issue on repMax", () => {
    const r = templateTargetSchema.safeParse({
      ...repsTarget,
      repMin: 10,
      repMax: 6,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.path).toEqual(["repMax"]);
    }
  });

  it("accepts repMin === repMax (straight sets)", () => {
    expect(
      templateTargetSchema.safeParse({ ...repsTarget, repMin: 8, repMax: 8 })
        .success,
    ).toBe(true);
  });
});

describe("templateTargetSchema VOLUME branch and discriminator", () => {
  it("requires targetVolumeKg in VOLUME mode", () => {
    expect(
      templateTargetSchema.safeParse({ targetType: "VOLUME" }).success,
    ).toBe(false);
    expect(
      templateTargetSchema.safeParse({
        targetType: "VOLUME",
        targetVolumeKg: 5000,
      }).success,
    ).toBe(true);
  });

  it("rejects a missing or unknown targetType", () => {
    expect(
      templateTargetSchema.safeParse({ targetSets: 4, repMin: 6, repMax: 10 })
        .success,
    ).toBe(false);
    expect(
      templateTargetSchema.safeParse({ ...repsTarget, targetType: "TIME" })
        .success,
    ).toBe(false);
  });
});

describe("templateExerciseInputSchema", () => {
  it("parses a valid REPS exercise and defaults warmups to []", () => {
    const r = templateExerciseInputSchema.safeParse({
      ...repsTarget,
      exerciseId: CUID,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.warmups).toEqual([]);
      expect(r.data.targetType).toBe("REPS");
      expect(r.data.exerciseId).toBe(CUID);
    }
  });

  it("caps warmups at 10", () => {
    const warmup = { weightMode: "ABSOLUTE", reps: 5, weightKg: 40 };
    const eleven = Array.from({ length: 11 }, () => warmup);
    expect(
      templateExerciseInputSchema.safeParse({
        ...repsTarget,
        exerciseId: CUID,
        warmups: eleven,
      }).success,
    ).toBe(false);
    expect(
      templateExerciseInputSchema.safeParse({
        ...repsTarget,
        exerciseId: CUID,
        warmups: eleven.slice(0, 10),
      }).success,
    ).toBe(true);
  });
});

describe("warmupSetInputSchema", () => {
  it("ABSOLUTE requires weightKg within (0, 500]", () => {
    expect(
      warmupSetInputSchema.safeParse({ weightMode: "ABSOLUTE", reps: 5 })
        .success,
    ).toBe(false);
    expect(
      warmupSetInputSchema.safeParse({
        weightMode: "ABSOLUTE",
        reps: 5,
        weightKg: 0,
      }).success,
    ).toBe(false);
    expect(
      warmupSetInputSchema.safeParse({
        weightMode: "ABSOLUTE",
        reps: 5,
        weightKg: 501,
      }).success,
    ).toBe(false);
    expect(
      warmupSetInputSchema.safeParse({
        weightMode: "ABSOLUTE",
        reps: 5,
        weightKg: 60,
      }).success,
    ).toBe(true);
  });

  it("PERCENT requires percentOfWorking within [1, 100]", () => {
    expect(
      warmupSetInputSchema.safeParse({ weightMode: "PERCENT", reps: 5 })
        .success,
    ).toBe(false);
    expect(
      warmupSetInputSchema.safeParse({
        weightMode: "PERCENT",
        reps: 5,
        percentOfWorking: 0,
      }).success,
    ).toBe(false);
    expect(
      warmupSetInputSchema.safeParse({
        weightMode: "PERCENT",
        reps: 5,
        percentOfWorking: 101,
      }).success,
    ).toBe(false);
    expect(
      warmupSetInputSchema.safeParse({
        weightMode: "PERCENT",
        reps: 5,
        percentOfWorking: 100,
      }).success,
    ).toBe(true);
  });
});

describe("createTemplateSchema", () => {
  const exercise = { ...repsTarget, exerciseId: CUID };

  it("accepts a minimal template", () => {
    expect(
      createTemplateSchema.safeParse({ name: "Push A", exercises: [exercise] })
        .success,
    ).toBe(true);
  });

  it("requires at least one exercise", () => {
    expect(
      createTemplateSchema.safeParse({ name: "Push A", exercises: [] })
        .success,
    ).toBe(false);
  });

  it("rejects unknown top-level keys (strictObject)", () => {
    expect(
      createTemplateSchema.safeParse({
        name: "Push A",
        exercises: [exercise],
        bogus: 1,
      }).success,
    ).toBe(false);
  });
});
