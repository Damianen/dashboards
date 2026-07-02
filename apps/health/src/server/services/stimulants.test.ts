import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { NotFoundError } from "./errors";
import { deleteStimulantEntry, logStimulant } from "./stimulants";
import type { WaterStatus } from "./water";

const getWaterStatus = vi.fn<(day?: string) => Promise<WaterStatus>>();
const stimulantCreate = vi.fn<(args: unknown) => Promise<unknown>>();
const stimulantDelete = vi.fn<(args: unknown) => Promise<unknown>>();

vi.mock("./water", () => ({
  getWaterStatus: (day?: string) => getWaterStatus(day),
}));
vi.mock("@/server/db", () => ({
  prisma: {
    stimulantEntry: {
      create: (args: unknown) => stimulantCreate(args),
      delete: (args: unknown) => stimulantDelete(args),
    },
  },
}));

function status(day: string, targetMl: number): WaterStatus {
  return { day, waterMl: 0, targetMl, remainingMl: targetMl };
}

function p2025(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("No record found", {
    code: "P2025",
    clientVersion: "test",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("logStimulant", () => {
  it("returns the created entry AND the day's recomputed water target", async () => {
    const created = { id: "s1", amountMg: "200", substance: "caffeine" };
    stimulantCreate.mockResolvedValue(created);
    getWaterStatus.mockResolvedValue(status("2026-07-01", 2700));

    const result = await logStimulant(
      { amountMg: 200, substance: "caffeine" },
      "PWA",
    );

    expect(result.entry).toBe(created);
    expect(result.waterTargetMl).toBe(2700);
  });

  it("buckets a near-midnight loggedAt into its Amsterdam civil day", async () => {
    stimulantCreate.mockResolvedValue({ id: "s1" });
    getWaterStatus.mockResolvedValue(status("2026-07-01", 2500));

    // 23:30 CEST on July 1 — still July 1 in Amsterdam (21:30Z).
    await logStimulant(
      {
        amountMg: 100,
        substance: "caffeine",
        loggedAt: "2026-07-01T23:30:00+02:00",
      },
      "MCP",
    );

    expect(stimulantCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        day: new Date("2026-07-01T00:00:00.000Z"),
        origin: "MCP",
      }),
    });
    expect(getWaterStatus).toHaveBeenCalledWith("2026-07-01");
  });
});

describe("deleteStimulantEntry", () => {
  it("recomputes the water target for the DELETED row's day, not today", async () => {
    stimulantDelete.mockResolvedValue({
      id: "s1",
      day: new Date("2026-06-28T00:00:00.000Z"),
    });
    getWaterStatus.mockResolvedValue(status("2026-06-28", 2500));

    await expect(deleteStimulantEntry("s1")).resolves.toEqual({
      id: "s1",
      day: "2026-06-28",
      waterTargetMl: 2500,
    });
    expect(stimulantDelete).toHaveBeenCalledWith({ where: { id: "s1" } });
    expect(getWaterStatus).toHaveBeenCalledWith("2026-06-28");
  });

  it("maps Prisma's P2025 to NotFoundError", async () => {
    stimulantDelete.mockRejectedValue(p2025());

    await expect(deleteStimulantEntry("missing")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(getWaterStatus).not.toHaveBeenCalled();
  });
});
