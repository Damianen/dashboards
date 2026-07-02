import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { DEFAULT_BASE_TARGET_ML } from "@/lib/water-defaults";
import { NotFoundError } from "./errors";
import type { DailySummary } from "./summary";
import { deleteWaterEntry, getWaterStatus, listWaterByDay } from "./water";

const getDailySummary =
  vi.fn<(day?: string) => Promise<DailySummary | null>>();
const settingFindUnique =
  vi.fn<(args: unknown) => Promise<{ value: unknown } | null>>();
const waterEntryCreate = vi.fn<(args: unknown) => Promise<unknown>>();
const waterEntryFindMany = vi.fn<(args: unknown) => Promise<unknown[]>>();
const waterEntryDelete = vi.fn<(args: unknown) => Promise<unknown>>();

vi.mock("./summary", () => ({
  getDailySummary: (day?: string) => getDailySummary(day),
}));
vi.mock("@/server/db", () => ({
  prisma: {
    setting: { findUnique: (args: unknown) => settingFindUnique(args) },
    waterEntry: {
      create: (args: unknown) => waterEntryCreate(args),
      findMany: (args: unknown) => waterEntryFindMany(args),
      delete: (args: unknown) => waterEntryDelete(args),
    },
  },
}));

/** The P2025 ("record not found") error Prisma throws for a missing delete target. */
function p2025(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("No record found", {
    code: "P2025",
    clientVersion: "test",
  });
}

/** A full DailySummary (all metrics null) with the fields under test overridden. */
function summaryRow(overrides: Partial<DailySummary>): DailySummary {
  return {
    day: "2026-07-01",
    weightKg: null,
    weight7dAvg: null,
    sleepScore: null,
    readinessScore: null,
    totalSleepMin: null,
    activeKcal: null,
    steps: null,
    intakeKcal: null,
    proteinG: null,
    carbG: null,
    fatG: null,
    waterMl: null,
    waterTargetMl: null,
    stimulantMg: null,
    caffeineMg: null,
    liftingVolumeKg: null,
    workingSets: null,
    supplementsTaken: null,
    bodyFatPct: null,
    muscleMassKg: null,
    deepMin: null,
    remMin: null,
    hrvMs: null,
    restingHrBpm: null,
    fiberG: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getDailySummary.mockResolvedValue(null);
  settingFindUnique.mockResolvedValue(null);
  waterEntryFindMany.mockResolvedValue([]);
});

describe("listWaterByDay", () => {
  it("filters on the day's UTC-midnight @db.Date value, newest first", async () => {
    await listWaterByDay("2026-07-01");

    expect(waterEntryFindMany).toHaveBeenCalledWith({
      where: { day: new Date("2026-07-01T00:00:00.000Z") },
      orderBy: { loggedAt: "desc" },
    });
  });
});

describe("deleteWaterEntry", () => {
  it("deletes by id and returns the row's civil day", async () => {
    waterEntryDelete.mockResolvedValue({
      id: "w1",
      day: new Date("2026-07-01T00:00:00.000Z"),
      amountMl: 250,
    });

    await expect(deleteWaterEntry("w1")).resolves.toEqual({
      id: "w1",
      day: "2026-07-01",
    });
    expect(waterEntryDelete).toHaveBeenCalledWith({ where: { id: "w1" } });
  });

  it("maps Prisma's P2025 to NotFoundError", async () => {
    waterEntryDelete.mockRejectedValue(p2025());

    await expect(deleteWaterEntry("missing")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("getWaterStatus", () => {
  it("uses the view's target and intake when a summary row exists — never the base setting", async () => {
    getDailySummary.mockResolvedValue(
      summaryRow({ waterTargetMl: 2500, waterMl: 1000 }),
    );

    const status = await getWaterStatus("2026-07-01");

    expect(status).toEqual({
      day: "2026-07-01",
      targetMl: 2500,
      waterMl: 1000,
      remainingMl: 1500,
    });
    expect(getDailySummary).toHaveBeenCalledWith("2026-07-01");
    expect(settingFindUnique).not.toHaveBeenCalled();
  });

  it("falls back to the stored base target (with zero intake) when the day has no summary row", async () => {
    settingFindUnique.mockResolvedValue({ value: 3000 });

    const status = await getWaterStatus("2026-07-01");

    expect(status).toEqual({
      day: "2026-07-01",
      targetMl: 3000,
      waterMl: 0,
      remainingMl: 3000,
    });
    expect(settingFindUnique).toHaveBeenCalledWith({
      where: { key: "water.baseTargetMl" },
    });
  });

  it("falls back to DEFAULT_BASE_TARGET_ML when there is no summary row and no setting row", async () => {
    const status = await getWaterStatus("2026-07-01");

    expect(status).toEqual({
      day: "2026-07-01",
      targetMl: DEFAULT_BASE_TARGET_ML,
      waterMl: 0,
      remainingMl: DEFAULT_BASE_TARGET_ML,
    });
  });

  it("clamps remainingMl at 0 when intake exceeds the target", async () => {
    getDailySummary.mockResolvedValue(
      summaryRow({ waterTargetMl: 2500, waterMl: 3200 }),
    );

    const status = await getWaterStatus("2026-07-01");

    expect(status).toEqual({
      day: "2026-07-01",
      targetMl: 2500,
      waterMl: 3200,
      remainingMl: 0,
    });
  });

  it("passes the requested day through to the summary lookup and the result", async () => {
    getDailySummary.mockResolvedValue(
      summaryRow({ day: "2020-05-05", waterTargetMl: 2000, waterMl: 500 }),
    );

    const status = await getWaterStatus("2020-05-05");

    expect(getDailySummary).toHaveBeenCalledWith("2020-05-05");
    expect(status.day).toBe("2020-05-05");
  });
});
