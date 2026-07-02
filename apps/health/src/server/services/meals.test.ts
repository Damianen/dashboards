import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { NotFoundError } from "./errors";
import { setMealArchived } from "./meals";

// meals.ts imports ./food at module scope (OFF/vision chain) — mock it out.
vi.mock("./food", () => ({
  getOrFetchProduct: vi.fn(),
  macrosFromJson: (json: unknown) => json,
  macrosFromProduct: vi.fn(),
}));

const mealUpdate =
  vi.fn<(args: { where: unknown; data: unknown }) => Promise<unknown>>();

vi.mock("@/server/db", () => ({
  prisma: {
    meal: { update: (args: { where: unknown; data: unknown }) => mealUpdate(args) },
  },
}));

/** A stored Meal row shaped for serializeMealSummary. */
function mealRow(archived: boolean) {
  return {
    id: "m1",
    name: "Chicken & rice",
    notes: null,
    yieldPortions: "4",
    perPortion: { kcal: 550, proteinG: 40, carbG: 60, fatG: 12 },
    archived,
    createdAt: new Date("2026-06-01T10:00:00.000Z"),
    updatedAt: new Date("2026-07-01T10:00:00.000Z"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setMealArchived", () => {
  it("passes the archived flag through (restore = false)", async () => {
    mealUpdate.mockResolvedValue(mealRow(false));

    const result = await setMealArchived("m1", false);

    expect(mealUpdate).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { archived: false },
    });
    expect(result.archived).toBe(false);
    expect(result.name).toBe("Chicken & rice");
  });

  it("archives with true", async () => {
    mealUpdate.mockResolvedValue(mealRow(true));

    const result = await setMealArchived("m1", true);

    expect(mealUpdate).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { archived: true },
    });
    expect(result.archived).toBe(true);
  });

  it("maps Prisma's P2025 to NotFoundError", async () => {
    mealUpdate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("No record found", {
        code: "P2025",
        clientVersion: "test",
      }),
    );

    await expect(setMealArchived("missing", true)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
