import { describe, expect, it } from "vitest";

import {
  itemContribution,
  type PlanBuilderItem,
  planItemFromPicked,
  planItemFromView,
  planSnapshot,
  planTotal,
  toCreateDailyPlanInput,
  toDailyPlanItemInput,
} from "./daily-plan-builder";
import type { CustomFoodDTO, FoodProductDTO } from "./food";
import type { Macros } from "./rules";
import type { DailyPlanItemView } from "@/server/services/dailyPlans";
import type { MealSummary } from "@/server/services/meals";

const CUID = "cflx0a1b2c3d4e5f6g7h8i9j";

// A Macros with everything null by default; override only the fields a test cares about.
function macros(p: Partial<Macros>): Macros {
  return {
    kcal: null,
    proteinG: null,
    carbG: null,
    fatG: null,
    fiberG: null,
    sugarG: null,
    saltG: null,
    caffeineMg: null,
    ...p,
  };
}

const productItem: PlanBuilderItem = {
  key: "a",
  name: "Coke",
  amount: 50,
  mealSlot: "LUNCH",
  source: {
    kind: "product",
    barcode: "5449000000996",
    per100g: macros({ kcal: 200, proteinG: 4 }),
  },
};

const mealItem: PlanBuilderItem = {
  key: "b",
  name: "Shake",
  amount: 2,
  mealSlot: null,
  source: {
    kind: "meal",
    mealId: CUID,
    perPortion: macros({ kcal: 300, proteinG: 30 }),
  },
};

describe("itemContribution", () => {
  it("scales a product per-100 g by its gram amount", () => {
    const c = itemContribution(productItem); // 200 * 50/100
    expect(c.kcal).toBe(100);
    expect(c.proteinG).toBe(2);
  });

  it("scales a meal per-portion by its portion count", () => {
    const c = itemContribution(mealItem); // 300 * 2
    expect(c.kcal).toBe(600);
    expect(c.proteinG).toBe(60);
  });
});

describe("planTotal", () => {
  it("sums every item's contribution (null-aware)", () => {
    const total = planTotal([productItem, mealItem]);
    expect(total.kcal).toBe(700); // 100 + 600
    expect(total.proteinG).toBe(62); // 2 + 60
    expect(total.fatG).toBeNull(); // unknown in both
  });

  it("is all-null for an empty plan", () => {
    expect(planTotal([]).kcal).toBeNull();
  });
});

describe("toDailyPlanItemInput", () => {
  it("serializes a product item with its slot", () => {
    expect(toDailyPlanItemInput(productItem)).toEqual({
      barcode: "5449000000996",
      quantityG: 50,
      mealSlot: "LUNCH",
    });
  });

  it("serializes a meal item by portions, omitting an unset slot", () => {
    expect(toDailyPlanItemInput(mealItem)).toEqual({
      mealId: CUID,
      portions: 2,
    });
  });

  it("serializes a custom-food item by grams", () => {
    const item: PlanBuilderItem = {
      key: "c",
      name: "Oats",
      amount: 80,
      mealSlot: null,
      source: { kind: "customFood", customFoodId: CUID, per100g: macros({ kcal: 380 }) },
    };
    expect(toDailyPlanItemInput(item)).toEqual({
      customFoodId: CUID,
      quantityG: 80,
    });
  });
});

describe("toCreateDailyPlanInput", () => {
  it("trims the name and omits blank notes", () => {
    const input = toCreateDailyPlanInput("  Workday  ", "   ", [productItem]);
    expect(input.name).toBe("Workday");
    expect("notes" in input).toBe(false);
    expect(input.items).toHaveLength(1);
  });

  it("keeps trimmed notes when present", () => {
    const input = toCreateDailyPlanInput("Rest day", "  gym off  ", [mealItem]);
    expect(input.notes).toBe("gym off");
  });
});

describe("planItemFromView (edit-mode round-trip)", () => {
  it("reconstructs a product item whose contribution matches the snapshot", () => {
    const view: DailyPlanItemView = {
      id: "i1",
      position: 0,
      productBarcode: "5449000000996",
      customFoodId: null,
      mealId: null,
      quantityG: 200,
      portions: null,
      mealSlot: "BREAKFAST",
      macros: macros({ kcal: 300, proteinG: 12 }),
      displayName: "Coke",
    };
    const item = planItemFromView(view);
    expect(item.source.kind).toBe("product");
    expect(item.amount).toBe(200);
    expect(item.mealSlot).toBe("BREAKFAST");
    // Re-scaling the derived per-unit macros by the amount returns the snapshot.
    expect(itemContribution(item).kcal).toBe(300);
    expect(itemContribution(item).proteinG).toBe(12);
    expect(toDailyPlanItemInput(item)).toEqual({
      barcode: "5449000000996",
      quantityG: 200,
      mealSlot: "BREAKFAST",
    });
  });

  it("reconstructs a meal item by portions", () => {
    const view: DailyPlanItemView = {
      id: "i2",
      position: 1,
      productBarcode: null,
      customFoodId: null,
      mealId: CUID,
      quantityG: null,
      portions: 2,
      mealSlot: null,
      macros: macros({ kcal: 600 }),
      displayName: "Shake",
    };
    const item = planItemFromView(view);
    expect(item.source.kind).toBe("meal");
    expect(item.amount).toBe(2);
    expect(itemContribution(item).kcal).toBe(600);
    expect(toDailyPlanItemInput(item)).toEqual({ mealId: CUID, portions: 2 });
  });
});

// Picker DTO fixtures for planItemFromPicked. The per100g/perPortion partial casts
// mirror the wire, where unreported detail macros are absent (undefined) — what
// coerceMacros normalizes to nulls.
const pickedProduct: FoodProductDTO = {
  barcode: "5449000000996",
  name: "Coke",
  brand: "Coca-Cola",
  imageUrl: null,
  per100g: macros({ kcal: 42, sugarG: 10.6 }),
  servingG: "330",
};

const pickedFood: CustomFoodDTO = {
  id: CUID,
  name: "Oats",
  brand: null,
  per100g: { kcal: 380, proteinG: 13.5 } as Macros,
  servingG: 40,
  source: "manual",
  archived: false,
  lastUsedAt: null,
};

const pickedMeal: MealSummary = {
  id: CUID,
  name: "Shake",
  notes: null,
  yieldPortions: 2,
  perPortion: { kcal: 300, proteinG: 30 } as Macros,
  perPortionKcal: 300,
  archived: false,
  createdAt: "2026-06-16T08:00:00.000Z",
  updatedAt: "2026-06-16T08:00:00.000Z",
};

describe("planItemFromPicked", () => {
  it("starts a product at its serving size (wire string), slotless, per-100 g verbatim", () => {
    const item = planItemFromPicked({ kind: "product", product: pickedProduct });
    expect(item.name).toBe("Coke");
    expect(item.amount).toBe(330);
    expect(item.mealSlot).toBeNull();
    expect(item.source).toEqual({
      kind: "product",
      barcode: "5449000000996",
      per100g: macros({ kcal: 42, sugarG: 10.6 }),
    });
  });

  it("defaults a product without a serving size to 100 g", () => {
    const item = planItemFromPicked({
      kind: "product",
      product: { ...pickedProduct, servingG: null },
    });
    expect(item.amount).toBe(100);
  });

  it("starts a saved food at its serving size, coercing partial per-100 g to full Macros", () => {
    const item = planItemFromPicked({ kind: "customFood", food: pickedFood });
    expect(item.name).toBe("Oats");
    expect(item.amount).toBe(40);
    expect(item.mealSlot).toBeNull();
    expect(item.source).toEqual({
      kind: "customFood",
      customFoodId: CUID,
      per100g: macros({ kcal: 380, proteinG: 13.5 }), // absent fields → null
    });
  });

  it("starts a picked meal at 1 portion as a coerced meal source, slotless", () => {
    const item = planItemFromPicked({ kind: "meal", meal: pickedMeal });
    expect(item.name).toBe("Shake");
    expect(item.amount).toBe(1);
    expect(item.mealSlot).toBeNull();
    expect(item.source).toEqual({
      kind: "meal",
      mealId: CUID,
      perPortion: macros({ kcal: 300, proteinG: 30 }),
    });
  });

  it("mints a distinct list key per conversion", () => {
    const a = planItemFromPicked({ kind: "meal", meal: pickedMeal });
    const b = planItemFromPicked({ kind: "meal", meal: pickedMeal });
    expect(a.key).not.toBe(b.key);
  });
});

describe("planSnapshot (dirty detection)", () => {
  it("ignores react keys, so an initial reminted per render compares equal", () => {
    const reminted = { ...productItem, key: "totally-different-key" };
    expect(planSnapshot([reminted])).toBe(planSnapshot([productItem]));
  });

  it("differs when the meal slot changes", () => {
    expect(planSnapshot([{ ...productItem, mealSlot: null }])).not.toBe(
      planSnapshot([productItem]),
    );
  });

  it("differs when an amount changes or an item is added", () => {
    expect(planSnapshot([{ ...mealItem, amount: 3 }])).not.toBe(
      planSnapshot([mealItem]),
    );
    expect(planSnapshot([productItem, mealItem])).not.toBe(
      planSnapshot([productItem]),
    );
  });
});
