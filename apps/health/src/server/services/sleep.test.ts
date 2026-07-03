import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainError, NotFoundError } from "./errors";
import { deleteSleep, logSleep } from "./sleep";

type Args = Record<string, unknown>;
const sleepCreate = vi.fn<(args: { data: Args }) => Promise<unknown>>();
const sleepFindFirst = vi.fn<(args: Args) => Promise<unknown>>();
const sleepFindUnique = vi.fn<(args: Args) => Promise<unknown>>();
const sleepDelete = vi.fn<(args: Args) => Promise<unknown>>();

vi.mock("@/server/db", () => ({
  prisma: {
    sleepSession: {
      create: (args: { data: Args }) => sleepCreate(args),
      findFirst: (args: Args) => sleepFindFirst(args),
      findUnique: (args: Args) => sleepFindUnique(args),
      delete: (args: Args) => sleepDelete(args),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  sleepFindFirst.mockResolvedValue(null); // default: no Oura session that day
  sleepCreate.mockResolvedValue({ id: "s1" });
});

/** The data object of the single expected create call. */
function createdData(): Args {
  const call = sleepCreate.mock.calls[0];
  if (!call) throw new Error("expected sleepSession.create to be called");
  return call[0].data;
}

describe("logSleep", () => {
  it("writes source MANUAL, never sets externalId, and leaves scores/stages null", async () => {
    await logSleep({
      bedtimeStart: "2026-07-03T23:30:00+02:00",
      bedtimeEnd: "2026-07-04T07:30:00+02:00",
    });

    const data = createdData();
    expect(data.source).toBe("MANUAL");
    expect("externalId" in data).toBe(false);
    for (const ouraOnly of ["deepMin", "remMin", "efficiency", "avgHrBpm"]) {
      expect(ouraOnly in data).toBe(false);
    }
    expect(data.totalSleepMin).toBe(480);
  });

  it("buckets by the WAKE day: bedtimeEnd's Amsterdam civil day", async () => {
    // Fell asleep on the 3rd, woke 07:30 CEST on the 4th → day 2026-07-04.
    await logSleep({
      bedtimeStart: "2026-07-03T23:30:00+02:00",
      bedtimeEnd: "2026-07-04T07:30:00+02:00",
    });

    expect(createdData().day).toEqual(new Date("2026-07-04T00:00:00.000Z"));
  });

  it("back-computes the window from a bare duration ('slept 7h30, woke just now')", async () => {
    const before = Date.now();
    await logSleep({ durationMin: 450 });

    const data = createdData();
    expect(data.totalSleepMin).toBe(450);
    const start = data.bedtimeStart as Date;
    const end = data.bedtimeEnd as Date;
    expect(end.getTime() - start.getTime()).toBe(450 * 60_000);
    expect(end.getTime()).toBeGreaterThanOrEqual(before);
    expect(end.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("refuses a day Oura already covered", async () => {
    sleepFindFirst.mockResolvedValue({ id: "oura1" });

    await expect(
      logSleep({
        bedtimeStart: "2026-07-03T23:30:00+02:00",
        bedtimeEnd: "2026-07-04T07:30:00+02:00",
      }),
    ).rejects.toThrow(/Oura already recorded sleep for 2026-07-04/);
    expect(sleepCreate).not.toHaveBeenCalled();
    // The guard filters on that day's OURA rows only — MANUAL naps stay allowed.
    expect(sleepFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { day: new Date("2026-07-04T00:00:00.000Z"), source: "OURA" },
      }),
    );
  });

  it("rejects invalid input via the schema before touching the DB", async () => {
    await expect(logSleep({})).rejects.toThrow();
    await expect(
      logSleep({ bedtimeStart: "2026-07-03T23:30:00+02:00", durationMin: 450 }),
    ).rejects.toThrow();
    expect(sleepFindFirst).not.toHaveBeenCalled();
    expect(sleepCreate).not.toHaveBeenCalled();
  });
});

describe("deleteSleep", () => {
  it("deletes a MANUAL entry and returns its civil day", async () => {
    sleepFindUnique.mockResolvedValue({
      id: "s1",
      source: "MANUAL",
      day: new Date("2026-07-04T00:00:00.000Z"),
    });
    sleepDelete.mockResolvedValue({});

    await expect(deleteSleep("s1")).resolves.toEqual({
      id: "s1",
      day: "2026-07-04",
    });
    expect(sleepDelete).toHaveBeenCalledWith({ where: { id: "s1" } });
  });

  it("throws NotFoundError for an unknown id", async () => {
    sleepFindUnique.mockResolvedValue(null);

    await expect(deleteSleep("nope")).rejects.toThrow(NotFoundError);
    expect(sleepDelete).not.toHaveBeenCalled();
  });

  it("refuses to delete a synced session", async () => {
    sleepFindUnique.mockResolvedValue({
      id: "s2",
      source: "OURA",
      day: new Date("2026-07-04T00:00:00.000Z"),
    });

    await expect(deleteSleep("s2")).rejects.toThrow(DomainError);
    await expect(deleteSleep("s2")).rejects.toThrow("synced sleep");
    expect(sleepDelete).not.toHaveBeenCalled();
  });
});
