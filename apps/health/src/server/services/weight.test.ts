import { beforeEach, describe, expect, it, vi } from "vitest";

import { logWeight } from "./weight";

const weightCreate = vi.fn<(args: { data: Record<string, unknown> }) => Promise<unknown>>();

vi.mock("@/server/db", () => ({
  prisma: {
    weightMeasurement: {
      create: (args: { data: Record<string, unknown> }) => weightCreate(args),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  weightCreate.mockResolvedValue({ id: "m1" });
});

/** The data object of the single expected create call. */
function createdData(): Record<string, unknown> {
  const call = weightCreate.mock.calls[0];
  if (!call) throw new Error("expected weightMeasurement.create to be called");
  return call[0].data;
}

describe("logWeight", () => {
  it("writes source MANUAL and never sets externalId (sync upserts key on it)", async () => {
    await logWeight({ weightKg: 82.4 });

    const data = createdData();
    expect(data.source).toBe("MANUAL");
    expect("externalId" in data).toBe(false);
  });

  it("buckets measuredAt into its Amsterdam civil day", async () => {
    // 23:30 CEST on July 1 is 21:30Z — still July 1 in Amsterdam, but already
    // July 1 UTC too; the interesting case is 00:30 CEST (22:30Z prev day).
    await logWeight({ weightKg: 80, measuredAt: "2026-07-02T00:30:00+02:00" });

    const data = createdData();
    expect(data.day).toEqual(new Date("2026-07-02T00:00:00.000Z"));
    expect(data.measuredAt).toEqual(new Date("2026-07-01T22:30:00.000Z"));
  });

  it("rounds to 2 dp so the value fits Decimal(5,2) exactly", async () => {
    await logWeight({ weightKg: 80.456 });

    expect(createdData().weightKg).toBe(80.46);
  });

  it("defaults measuredAt to now", async () => {
    const before = Date.now();
    await logWeight({ weightKg: 75 });

    const at = createdData().measuredAt as Date;
    expect(at).toBeInstanceOf(Date);
    expect(at.getTime()).toBeGreaterThanOrEqual(before);
    expect(at.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("rejects out-of-band weights via the schema", async () => {
    await expect(logWeight({ weightKg: 10 })).rejects.toThrow();
    await expect(logWeight({ weightKg: 400 })).rejects.toThrow();
    expect(weightCreate).not.toHaveBeenCalled();
  });
});
