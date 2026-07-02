import { beforeEach, describe, expect, it, vi } from "vitest";

import { EntryOrigin, MealSlot } from "@/generated/prisma/client";
import { todayLocal } from "@/lib/dates";
import { applyDailyPlan } from "./dailyPlans";
import { DomainError, NotFoundError } from "./errors";

// ----- Collaborator mocks (every name dailyPlans.ts imports from each module) -----

/** The exact object shape applyDailyPlan hands to logFood. */
interface LoggedFoodInput {
  barcode?: string;
  customFoodId?: string;
  quantityG: number;
  meal?: MealSlot;
  eatenAt?: string;
}
interface LoggedMealInput {
  mealId: string;
  portions: number;
  meal?: MealSlot;
  eatenAt?: string;
}

const logFood =
  vi.fn<(input: LoggedFoodInput, origin: EntryOrigin) => Promise<unknown>>();
const logMeal =
  vi.fn<(input: LoggedMealInput, origin: EntryOrigin) => Promise<unknown>>();
const getOrFetchProduct = vi.fn<(barcode: string) => Promise<unknown>>();
const macrosFromJson = vi.fn<(json: unknown) => unknown>();
const dailyPlanFindUnique =
  vi.fn<(args: unknown) => Promise<PlanFixture | null>>();

vi.mock("./food", () => ({
  logFood: (input: LoggedFoodInput, origin: EntryOrigin) =>
    logFood(input, origin),
  getOrFetchProduct: (barcode: string) => getOrFetchProduct(barcode),
  macrosFromJson: (json: unknown) => macrosFromJson(json),
}));
vi.mock("./meals", () => ({
  logMeal: (input: LoggedMealInput, origin: EntryOrigin) =>
    logMeal(input, origin),
}));
vi.mock("@/server/db", () => ({
  prisma: {
    dailyPlan: { findUnique: (args: unknown) => dailyPlanFindUnique(args) },
  },
}));

// ----- Fixtures (structural stand-ins for the Prisma payload; Decimal columns
// arrive as Decimal objects the code Number()-coerces, so plain numeric strings
// exercise the same coercion) -----

interface PlanItemFixture {
  position: number;
  productBarcode: string | null;
  customFoodId: string | null;
  mealId: string | null;
  quantityG: string | null;
  portions: string | null;
  mealSlot: MealSlot | null;
  product: { name: string } | null;
  customFood: { name: string } | null;
  meal: { name: string } | null;
}

interface PlanFixture {
  id: string;
  items: PlanItemFixture[];
}

const EMPTY_ITEM: Omit<PlanItemFixture, "position"> = {
  productBarcode: null,
  customFoodId: null,
  mealId: null,
  quantityG: null,
  portions: null,
  mealSlot: null,
  product: null,
  customFood: null,
  meal: null,
};

const barcodeItem: PlanItemFixture = {
  ...EMPTY_ITEM,
  position: 0,
  productBarcode: "5449000000996",
  quantityG: "150.5",
  mealSlot: MealSlot.BREAKFAST,
  product: { name: "Oats" },
};
const customFoodItem: PlanItemFixture = {
  ...EMPTY_ITEM,
  position: 1,
  customFoodId: "cf-1",
  quantityG: "80",
  mealSlot: MealSlot.LUNCH,
  customFood: { name: "Homemade Bread" },
};
const mealItem: PlanItemFixture = {
  ...EMPTY_ITEM,
  position: 2,
  mealId: "meal-1",
  portions: "1.5",
  mealSlot: MealSlot.DINNER,
  meal: { name: "Chili" },
};

function plan(items: PlanItemFixture[]): PlanFixture {
  return { id: "plan-1", items };
}

beforeEach(() => {
  vi.clearAllMocks();
  logFood.mockResolvedValue({});
  logMeal.mockResolvedValue({});
  dailyPlanFindUnique.mockResolvedValue(null);
});

describe("applyDailyPlan", () => {
  it("logs every item kind through the existing write paths, pinned to UTC noon of a past day", async () => {
    dailyPlanFindUnique.mockResolvedValue(
      plan([barcodeItem, customFoodItem, mealItem]),
    );

    const result = await applyDailyPlan("plan-1", "2020-01-01", EntryOrigin.MCP);

    expect(result).toEqual({ logged: 3, skipped: [] });
    expect(dailyPlanFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "plan-1" } }),
    );
    expect(logFood).toHaveBeenNthCalledWith(
      1,
      {
        barcode: "5449000000996",
        quantityG: 150.5,
        meal: MealSlot.BREAKFAST,
        eatenAt: "2020-01-01T12:00:00.000Z",
      },
      EntryOrigin.MCP,
    );
    expect(logFood).toHaveBeenNthCalledWith(
      2,
      {
        customFoodId: "cf-1",
        quantityG: 80,
        meal: MealSlot.LUNCH,
        eatenAt: "2020-01-01T12:00:00.000Z",
      },
      EntryOrigin.MCP,
    );
    expect(logMeal).toHaveBeenCalledWith(
      {
        mealId: "meal-1",
        portions: 1.5,
        meal: MealSlot.DINNER,
        eatenAt: "2020-01-01T12:00:00.000Z",
      },
      EntryOrigin.MCP,
    );
  });

  it("passes the origin through unchanged", async () => {
    dailyPlanFindUnique.mockResolvedValue(plan([barcodeItem]));

    await applyDailyPlan("plan-1", "2020-01-01", EntryOrigin.PWA);

    expect(logFood.mock.calls[0]?.[1]).toBe(EntryOrigin.PWA);
  });

  it("leaves eatenAt undefined when applying to today (entries log at 'now')", async () => {
    dailyPlanFindUnique.mockResolvedValue(plan([barcodeItem, mealItem]));

    await applyDailyPlan("plan-1", todayLocal(), EntryOrigin.PWA);

    expect(logFood.mock.calls[0]?.[0].eatenAt).toBeUndefined();
    expect(logMeal.mock.calls[0]?.[0].eatenAt).toBeUndefined();
  });

  it("skips a DomainError item with its message and still logs the rest", async () => {
    dailyPlanFindUnique.mockResolvedValue(
      plan([barcodeItem, customFoodItem, mealItem]),
    );
    logFood.mockImplementation(async (input) => {
      if (input.customFoodId != null) throw new DomainError("boom");
      return {};
    });

    const result = await applyDailyPlan("plan-1", "2020-01-01", EntryOrigin.PWA);

    expect(result).toEqual({
      logged: 2,
      skipped: [{ item: "Homemade Bread", reason: "boom" }],
    });
    expect(logFood).toHaveBeenCalledTimes(2);
    expect(logMeal).toHaveBeenCalledTimes(1);
  });

  it("masks a non-DomainError rejection behind the generic reason", async () => {
    dailyPlanFindUnique.mockResolvedValue(plan([barcodeItem]));
    logFood.mockRejectedValue(new Error("db down"));

    const result = await applyDailyPlan("plan-1", "2020-01-01", EntryOrigin.PWA);

    expect(result).toEqual({
      logged: 0,
      skipped: [{ item: "Oats", reason: "could not be logged" }],
    });
  });

  it("skips an orphan item (all sources FK-nulled) with a positional label", async () => {
    const orphan: PlanItemFixture = { ...EMPTY_ITEM, position: 3 };
    dailyPlanFindUnique.mockResolvedValue(plan([barcodeItem, orphan]));

    const result = await applyDailyPlan("plan-1", "2020-01-01", EntryOrigin.PWA);

    expect(result).toEqual({
      logged: 1,
      skipped: [
        {
          item: "item 4",
          reason: "its product, custom food, or meal no longer exists",
        },
      ],
    });
    expect(logFood).toHaveBeenCalledTimes(1);
    expect(logMeal).not.toHaveBeenCalled();
  });

  it("rejects with NotFoundError when the plan does not exist", async () => {
    dailyPlanFindUnique.mockResolvedValue(null);

    await expect(
      applyDailyPlan("missing", "2020-01-01", EntryOrigin.PWA),
    ).rejects.toThrow(NotFoundError);
    await expect(
      applyDailyPlan("missing", "2020-01-01", EntryOrigin.PWA),
    ).rejects.toThrow("daily plan not found: missing");
    expect(logFood).not.toHaveBeenCalled();
    expect(logMeal).not.toHaveBeenCalled();
  });
});
