import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { DomainError, NotFoundError } from "./errors";
import { logFood, updateFoodEntry } from "./food";

// ----- Collaborator mocks (food.ts imports ./off and ./vision at module scope) -----

const foodEntryFindUnique = vi.fn<(args: unknown) => Promise<unknown>>();
const foodEntryUpdate =
  vi.fn<(args: { where: unknown; data: Record<string, unknown> }) => Promise<unknown>>();
const foodEntryCreate = vi.fn<(args: unknown) => Promise<unknown>>();
const foodProductFindUnique = vi.fn<(args: unknown) => Promise<unknown>>();
const customFoodFindUnique = vi.fn<(args: unknown) => Promise<unknown>>();

vi.mock("@/server/db", () => ({
  prisma: {
    foodEntry: {
      findUnique: (args: unknown) => foodEntryFindUnique(args),
      update: (args: { where: unknown; data: Record<string, unknown> }) =>
        foodEntryUpdate(args),
      create: (args: unknown) => foodEntryCreate(args),
    },
    foodProduct: { findUnique: (args: unknown) => foodProductFindUnique(args) },
    customFood: { findUnique: (args: unknown) => customFoodFindUnique(args) },
  },
}));
vi.mock("./off", () => ({
  fetchProduct: vi.fn(),
  searchProducts: vi.fn(),
}));
vi.mock("./vision", () => ({
  analyzeImage: vi.fn(),
  VisionError: class VisionError extends Error {},
}));

/** A stored FoodEntry row (Decimal columns as plain numeric strings — the code
 *  Number()-coerces them, so strings exercise the same path). */
function entryRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "e1",
    quantityG: "150",
    kcal: "300",
    proteinG: "12",
    carbG: "40",
    fatG: "9",
    fiberG: "3.5",
    sugarG: "8",
    saltG: "0.6",
    caffeineMg: "40",
    meal: "LUNCH",
    notes: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  foodEntryUpdate.mockResolvedValue({ id: "e1" });
});

/** The data object of the single expected update call. */
function updatedData(): Record<string, unknown> {
  const call = foodEntryUpdate.mock.calls[0];
  if (!call) throw new Error("expected foodEntry.update to be called");
  return call[0].data;
}

describe("logFood archived guard", () => {
  it("refuses to log an archived custom food by id (write-path twin of the read exclusions)", async () => {
    customFoodFindUnique.mockResolvedValue({
      id: "cf1",
      name: "Old shake",
      archived: true,
      per100g: { kcal: 100, proteinG: 10, carbG: 5, fatG: 2 },
    });

    await expect(
      logFood({ customFoodId: "c".repeat(24), quantityG: 100 }, "MCP"),
    ).rejects.toBeInstanceOf(DomainError);
    expect(foodEntryCreate).not.toHaveBeenCalled();
  });
});

describe("updateFoodEntry", () => {
  it("rescales every snapshot field from the entry's OWN totals — never the product cache", async () => {
    foodEntryFindUnique.mockResolvedValue(entryRow());

    await updateFoodEntry("e1", { quantityG: 300 });

    expect(foodEntryUpdate).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: {
        quantityG: 300,
        kcal: 600,
        proteinG: 24,
        carbG: 80,
        fatG: 18,
        fiberG: 7,
        sugarG: 16,
        saltG: 1.2,
        caffeineMg: 80,
      },
    });
    // The snapshot rule: a quantity edit must never re-read the cache.
    expect(foodProductFindUnique).not.toHaveBeenCalled();
    expect(customFoodFindUnique).not.toHaveBeenCalled();
  });

  it("keeps null detail macros null when rescaling", async () => {
    foodEntryFindUnique.mockResolvedValue(
      entryRow({ fiberG: null, sugarG: null, saltG: null, caffeineMg: null }),
    );

    await updateFoodEntry("e1", { quantityG: 75 });

    const data = updatedData();
    expect(data.kcal).toBe(150);
    expect(data.fiberG).toBeNull();
    expect(data.sugarG).toBeNull();
    expect(data.saltG).toBeNull();
    expect(data.caffeineMg).toBeNull();
  });

  it("refuses a quantity edit on a portions-based (meal-logged) entry", async () => {
    foodEntryFindUnique.mockResolvedValue(
      entryRow({ quantityG: null, portions: "1.5" }),
    );

    await expect(updateFoodEntry("e1", { quantityG: 200 })).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(foodEntryUpdate).not.toHaveBeenCalled();
  });

  it("updates meal only, leaving the macros untouched", async () => {
    foodEntryFindUnique.mockResolvedValue(entryRow());

    await updateFoodEntry("e1", { meal: "DINNER" });

    expect(foodEntryUpdate).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { meal: "DINNER" },
    });
  });

  it("clears meal and notes with explicit nulls", async () => {
    foodEntryFindUnique.mockResolvedValue(
      entryRow({ notes: "AI estimate: assumed butter" }),
    );

    await updateFoodEntry("e1", { meal: null, notes: null });

    expect(foodEntryUpdate).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { meal: null, notes: null },
    });
  });

  it("refuses a rescale that would overflow the Decimal snapshot columns", async () => {
    foodEntryFindUnique.mockResolvedValue(entryRow({ quantityG: "1", kcal: "500" }));

    await expect(
      updateFoodEntry("e1", { quantityG: 5000 }),
    ).rejects.toBeInstanceOf(DomainError);
    expect(foodEntryUpdate).not.toHaveBeenCalled();
  });

  it("throws NotFoundError for an unknown id", async () => {
    foodEntryFindUnique.mockResolvedValue(null);

    await expect(updateFoodEntry("missing", { meal: "SNACK" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("maps a raced P2025 on update to NotFoundError", async () => {
    foodEntryFindUnique.mockResolvedValue(entryRow());
    foodEntryUpdate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("No record found", {
        code: "P2025",
        clientVersion: "test",
      }),
    );

    await expect(updateFoodEntry("e1", { meal: "SNACK" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("rejects an empty patch via the schema", async () => {
    await expect(updateFoodEntry("e1", {})).rejects.toThrow();
    expect(foodEntryFindUnique).not.toHaveBeenCalled();
  });
});
