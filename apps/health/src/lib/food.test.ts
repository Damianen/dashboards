import { describe, expect, it } from "vitest";

import {
  dayTotal,
  type FoodEntryDTO,
  type FoodEntryView,
  groupByMeal,
  suggestMeal,
  toView,
} from "./food";

// A local-time Date so getHours() is the constructed hour regardless of the
// test runner's timezone.
const at = (hour: number) => new Date(2026, 5, 16, hour, 0, 0);

describe("suggestMeal", () => {
  it("suggests breakfast in the morning", () => {
    expect(suggestMeal(at(8))).toBe("BREAKFAST");
  });
  it("suggests lunch at midday", () => {
    expect(suggestMeal(at(13))).toBe("LUNCH");
  });
  it("suggests dinner in the evening", () => {
    expect(suggestMeal(at(19))).toBe("DINNER");
  });
  it("suggests a snack late at night", () => {
    expect(suggestMeal(at(23))).toBe("SNACK");
  });
  it("uses < boundaries (11:00 → lunch, 15:00 → dinner, 21:00 → snack)", () => {
    expect(suggestMeal(at(11))).toBe("LUNCH");
    expect(suggestMeal(at(15))).toBe("DINNER");
    expect(suggestMeal(at(21))).toBe("SNACK");
  });
});

const dto = (over: Partial<FoodEntryDTO>): FoodEntryDTO => ({
  id: "e1",
  eatenAt: "2026-06-16T08:00:00.000Z",
  productBarcode: null,
  customName: null,
  quantityG: "100",
  kcal: "0",
  proteinG: "0",
  carbG: "0",
  fatG: "0",
  meal: null,
  product: null,
  ...over,
});

describe("toView", () => {
  it("coerces the Decimal string columns to numbers", () => {
    const v = toView(
      dto({ quantityG: "55.5", kcal: "123.4", proteinG: "5.1", carbG: "20.2", fatG: "3.3" }),
    );
    expect(v.quantityG).toBe(55.5);
    expect(v.kcal).toBe(123.4);
    expect(v.proteinG).toBe(5.1);
    expect(v.carbG).toBe(20.2);
    expect(v.fatG).toBe(3.3);
  });

  it("prefers the joined product name, marking it non-custom", () => {
    const v = toView(
      dto({ productBarcode: "5449000000996", product: { name: "Coca-Cola", brand: "Coca-Cola", imageUrl: null } }),
    );
    expect(v.displayName).toBe("Coca-Cola");
    expect(v.isCustom).toBe(false);
  });

  it("falls back to the custom name and marks it custom", () => {
    const v = toView(dto({ customName: "Homemade soup" }));
    expect(v.displayName).toBe("Homemade soup");
    expect(v.isCustom).toBe(true);
  });

  it("falls back to the barcode when a product join is missing", () => {
    const v = toView(dto({ productBarcode: "12345678", product: null }));
    expect(v.displayName).toBe("12345678");
    expect(v.isCustom).toBe(false);
  });
});

const view = (over: Partial<FoodEntryView>): FoodEntryView => ({
  id: "v",
  eatenAt: "2026-06-16T08:00:00.000Z",
  meal: null,
  displayName: "x",
  quantityG: 100,
  isCustom: false,
  kcal: 0,
  proteinG: 0,
  carbG: 0,
  fatG: 0,
  ...over,
});

describe("dayTotal", () => {
  it("sums the four macros", () => {
    const total = dayTotal([
      view({ kcal: 100, proteinG: 10, carbG: 20, fatG: 5 }),
      view({ kcal: 250, proteinG: 4, carbG: 30, fatG: 8 }),
    ]);
    expect(total).toEqual({ kcal: 350, proteinG: 14, carbG: 50, fatG: 13 });
  });

  it("is all-zero for an empty day", () => {
    expect(dayTotal([])).toEqual({ kcal: 0, proteinG: 0, carbG: 0, fatG: 0 });
  });
});

describe("groupByMeal", () => {
  it("orders groups breakfast→snack, drops empty meals, computes subtotals", () => {
    const groups = groupByMeal([
      view({ id: "a", meal: "DINNER", kcal: 600 }),
      view({ id: "b", meal: "BREAKFAST", kcal: 300 }),
      view({ id: "c", meal: "BREAKFAST", kcal: 100 }),
    ]);
    expect(groups.map((g) => g.meal)).toEqual(["BREAKFAST", "DINNER"]);
    const [breakfast, dinner] = groups;
    expect(breakfast?.entries.map((e) => e.id)).toEqual(["b", "c"]);
    expect(breakfast?.subtotal.kcal).toBe(400);
    expect(dinner?.subtotal.kcal).toBe(600);
  });

  it("collects meal-less entries into a trailing Other group", () => {
    const groups = groupByMeal([
      view({ id: "a", meal: "LUNCH" }),
      view({ id: "b", meal: null }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Lunch", "Other"]);
    expect(groups[1]?.meal).toBeNull();
  });

  it("returns no groups for an empty day", () => {
    expect(groupByMeal([])).toEqual([]);
  });
});
