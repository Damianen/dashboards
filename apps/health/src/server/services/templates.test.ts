import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import type {
  TemplateExerciseInput,
  WarmupSetInput,
} from "@/lib/schemas/template";
import { DomainError } from "./errors";
import {
  isUniqueNameError,
  selectTemplateByName,
  serializeWarmups,
  targetColumns,
  warmupColumns,
} from "./templates";

describe("serializeWarmups", () => {
  it("coerces Decimal weights to numbers and preserves nulls", () => {
    const views = serializeWarmups([
      {
        position: 0,
        reps: 10,
        weightMode: "ABSOLUTE",
        weightKg: new Prisma.Decimal("60.5"),
        percentOfWorking: null,
      },
      {
        position: 1,
        reps: 5,
        weightMode: "PERCENT",
        weightKg: null,
        percentOfWorking: new Prisma.Decimal("72.5"),
      },
    ]);
    expect(views).toEqual([
      {
        position: 0,
        reps: 10,
        weightMode: "ABSOLUTE",
        weightKg: 60.5,
        percentOfWorking: null,
      },
      {
        position: 1,
        reps: 5,
        weightMode: "PERCENT",
        weightKg: null,
        percentOfWorking: 72.5,
      },
    ]);
    // Plain numbers, not Decimal instances.
    expect(typeof views[0]?.weightKg).toBe("number");
  });

  it("maps an empty list to an empty list", () => {
    expect(serializeWarmups([])).toEqual([]);
  });
});

describe("targetColumns", () => {
  it("REPS mode keeps the rep columns and nulls the volume column", () => {
    const input: TemplateExerciseInput = {
      targetType: "REPS",
      targetSets: 4,
      repMin: 6,
      repMax: 10,
      targetWeightKg: 80,
      weightIncrementKg: 2.5,
      exerciseId: "cku0000000000000000000000",
      warmups: [],
    };
    expect(targetColumns(input)).toEqual({
      targetType: "REPS",
      targetSets: 4,
      repMin: 6,
      repMax: 10,
      targetWeightKg: 80,
      weightIncrementKg: 2.5,
      targetVolumeKg: null,
    });
  });

  it("REPS mode defaults omitted optional weights to null", () => {
    const input: TemplateExerciseInput = {
      targetType: "REPS",
      targetSets: 3,
      repMin: 8,
      repMax: 12,
      exerciseId: "cku0000000000000000000000",
      warmups: [],
    };
    const cols = targetColumns(input);
    expect(cols.targetWeightKg).toBeNull();
    expect(cols.weightIncrementKg).toBeNull();
  });

  it("VOLUME mode keeps the volume goal and nulls every rep column", () => {
    const input: TemplateExerciseInput = {
      targetType: "VOLUME",
      targetVolumeKg: 5000,
      exerciseId: "cku0000000000000000000000",
      warmups: [],
    };
    expect(targetColumns(input)).toEqual({
      targetType: "VOLUME",
      targetSets: null,
      repMin: null,
      repMax: null,
      targetWeightKg: null,
      weightIncrementKg: null,
      targetVolumeKg: 5000,
    });
  });
});

describe("warmupColumns", () => {
  it("ABSOLUTE mode nulls percentOfWorking and takes the given position", () => {
    const w: WarmupSetInput = { weightMode: "ABSOLUTE", reps: 10, weightKg: 40 };
    expect(warmupColumns(w, 2)).toEqual({
      position: 2,
      reps: 10,
      weightMode: "ABSOLUTE",
      weightKg: 40,
      percentOfWorking: null,
    });
  });

  it("PERCENT mode nulls weightKg", () => {
    const w: WarmupSetInput = {
      weightMode: "PERCENT",
      reps: 5,
      percentOfWorking: 50,
    };
    expect(warmupColumns(w, 0)).toEqual({
      position: 0,
      reps: 5,
      weightMode: "PERCENT",
      weightKg: null,
      percentOfWorking: 50,
    });
  });
});

describe("isUniqueNameError", () => {
  it("is true only for Prisma P2002", () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint", {
      code: "P2002",
      clientVersion: "test",
    });
    const p2025 = new Prisma.PrismaClientKnownRequestError("No record found", {
      code: "P2025",
      clientVersion: "test",
    });
    expect(isUniqueNameError(p2002)).toBe(true);
    expect(isUniqueNameError(p2025)).toBe(false);
    expect(isUniqueNameError(new Error("P2002"))).toBe(false);
    expect(isUniqueNameError(undefined)).toBe(false);
  });
});

describe("selectTemplateByName", () => {
  const templates = [
    { name: "Push Day A", archived: false },
    { name: "Pull Day", archived: false },
    { name: "Old Legs", archived: true },
  ];

  it("matches case-insensitively", () => {
    expect(selectTemplateByName(templates, "push day a")).toBe(templates[0]);
    expect(selectTemplateByName(templates, "PULL DAY")).toBe(templates[1]);
  });

  it("lists only ACTIVE template names when nothing matches", () => {
    expect(() => selectTemplateByName(templates, "Leg Day")).toThrow(
      new DomainError(
        'no template named "Leg Day"; available: Push Day A, Pull Day',
      ),
    );
  });

  it("says (none) when there are no active templates to offer", () => {
    expect(() =>
      selectTemplateByName([{ name: "Old", archived: true }], "New"),
    ).toThrow('no template named "New"; available: (none)');
  });

  it("refuses an archived match with a distinct error", () => {
    expect(() => selectTemplateByName(templates, "old legs")).toThrow(
      new DomainError('template "Old Legs" is archived'),
    );
  });
});
