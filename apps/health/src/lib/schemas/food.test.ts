import { describe, expect, it } from "vitest";

import {
  createCustomFoodSchema,
  logFoodSchema,
  per100gSchema,
} from "./food";

const CUID = "cflx0a1b2c3d4e5f6g7h8i9j";

describe("per100gSchema", () => {
  it("accepts the four required macros, optional rest omitted", () => {
    const r = per100gSchema.safeParse({
      kcal: 250,
      proteinG: 10,
      carbG: 30,
      fatG: 8,
    });
    expect(r.success).toBe(true);
  });

  it("requires kcal/protein/carb/fat", () => {
    expect(per100gSchema.safeParse({ kcal: 1, proteinG: 1, carbG: 1 }).success).toBe(
      false,
    );
  });

  it("rejects negative macros", () => {
    expect(
      per100gSchema.safeParse({ kcal: -1, proteinG: 0, carbG: 0, fatG: 0 })
        .success,
    ).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    expect(
      per100gSchema.safeParse({
        kcal: 1,
        proteinG: 1,
        carbG: 1,
        fatG: 1,
        bogus: 1,
      }).success,
    ).toBe(false);
  });
});

describe("createCustomFoodSchema", () => {
  const base = {
    name: "Granny's oats",
    per100g: { kcal: 380, proteinG: 13, carbG: 60, fatG: 7 },
  };

  it("defaults source to MANUAL", () => {
    const r = createCustomFoodSchema.parse(base);
    expect(r.source).toBe("MANUAL");
  });

  it("accepts an explicit LABEL_SCAN source and a serving", () => {
    const r = createCustomFoodSchema.parse({
      ...base,
      brand: "Quaker",
      servingG: 40,
      source: "LABEL_SCAN",
    });
    expect(r.source).toBe("LABEL_SCAN");
    expect(r.servingG).toBe(40);
  });

  it("rejects an unknown source", () => {
    expect(
      createCustomFoodSchema.safeParse({ ...base, source: "ESTIMATE" }).success,
    ).toBe(false);
  });

  it("rejects an empty name and a non-positive serving", () => {
    expect(createCustomFoodSchema.safeParse({ ...base, name: "" }).success).toBe(
      false,
    );
    expect(
      createCustomFoodSchema.safeParse({ ...base, servingG: 0 }).success,
    ).toBe(false);
  });
});

describe("logFoodSchema sources", () => {
  it("accepts a barcode alone (no kcal needed)", () => {
    expect(
      logFoodSchema.safeParse({ barcode: "5449000000996", quantityG: 100 })
        .success,
    ).toBe(true);
  });

  it("accepts a customFoodId alone (no kcal needed)", () => {
    expect(
      logFoodSchema.safeParse({ customFoodId: CUID, quantityG: 100 }).success,
    ).toBe(true);
  });

  it("accepts customName WITH kcal", () => {
    expect(
      logFoodSchema.safeParse({
        customName: "Soup",
        quantityG: 250,
        kcal: 120,
      }).success,
    ).toBe(true);
  });

  it("rejects customName WITHOUT kcal", () => {
    expect(
      logFoodSchema.safeParse({ customName: "Soup", quantityG: 250 }).success,
    ).toBe(false);
  });

  it("rejects zero sources", () => {
    expect(logFoodSchema.safeParse({ quantityG: 100 }).success).toBe(false);
  });

  it("rejects two sources at once", () => {
    expect(
      logFoodSchema.safeParse({
        barcode: "5449000000996",
        customFoodId: CUID,
        quantityG: 100,
      }).success,
    ).toBe(false);
    expect(
      logFoodSchema.safeParse({
        customFoodId: CUID,
        customName: "Soup",
        kcal: 1,
        quantityG: 100,
      }).success,
    ).toBe(false);
  });

  it("rejects a non-cuid customFoodId", () => {
    expect(
      logFoodSchema.safeParse({ customFoodId: "nope", quantityG: 100 }).success,
    ).toBe(false);
  });
});
