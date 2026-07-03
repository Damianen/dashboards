import { beforeEach, describe, expect, it, vi } from "vitest";

import { dayToDbDate, shiftDay, todayLocal } from "@/lib/dates";
import {
  dailyWorkoutMinutes,
  listWorkouts,
  serializeWorkout,
  type WorkoutRow,
} from "./workouts";

const workoutFindMany = vi.fn<(args: unknown) => Promise<WorkoutRow[]>>();

vi.mock("@/server/db", () => ({
  prisma: { workout: { findMany: (args: unknown) => workoutFindMany(args) } },
}));

/** A full workout row with the fields under test overridden. */
function workoutRow(overrides: Partial<WorkoutRow> = {}): WorkoutRow {
  return {
    id: "w1",
    type: "Running",
    startedAt: new Date("2026-06-20T06:30:00.000Z"),
    day: new Date("2026-06-20T00:00:00.000Z"),
    durationSeconds: 2700,
    distance: 8.2,
    activeEnergyKcal: 450,
    avgHeartRate: 150,
    maxHeartRate: 175,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  workoutFindMany.mockResolvedValue([]);
});

describe("dailyWorkoutMinutes", () => {
  it("sums durations per civil day and converts to whole minutes", () => {
    expect(
      dailyWorkoutMinutes([
        { day: "2026-06-20", durationSeconds: 2700 }, // 45m
        { day: "2026-06-20", durationSeconds: 900 }, // 15m
      ]),
    ).toEqual([{ day: "2026-06-20", value: 60 }]);
  });

  it("skips workouts with no duration", () => {
    expect(
      dailyWorkoutMinutes([
        { day: "2026-06-20", durationSeconds: null },
        { day: "2026-06-20", durationSeconds: 1800 },
      ]),
    ).toEqual([{ day: "2026-06-20", value: 30 }]);
  });

  it("sorts days ascending and rounds to the nearest minute", () => {
    expect(
      dailyWorkoutMinutes([
        { day: "2026-06-21", durationSeconds: 100 }, // 1.67m → 2
        { day: "2026-06-19", durationSeconds: 1810 }, // 30.17m → 30
      ]),
    ).toEqual([
      { day: "2026-06-19", value: 30 },
      { day: "2026-06-21", value: 2 },
    ]);
  });

  it("returns [] when there are no workouts", () => {
    expect(dailyWorkoutMinutes([])).toEqual([]);
  });
});

describe("serializeWorkout", () => {
  it("maps a row to the wire shape: ISO instant, civil day, metrics verbatim", () => {
    expect(serializeWorkout(workoutRow())).toEqual({
      id: "w1",
      type: "Running",
      startedAt: "2026-06-20T06:30:00.000Z",
      day: "2026-06-20",
      durationSeconds: 2700,
      distance: 8.2,
      activeEnergyKcal: 450,
      avgHeartRate: 150,
      maxHeartRate: 175,
    });
  });

  it("preserves null metrics (never coerces to 0)", () => {
    const item = serializeWorkout(
      workoutRow({
        durationSeconds: null,
        distance: null,
        activeEnergyKcal: null,
        avgHeartRate: null,
        maxHeartRate: null,
      }),
    );
    expect(item.durationSeconds).toBeNull();
    expect(item.distance).toBeNull();
    expect(item.activeEnergyKcal).toBeNull();
    expect(item.avgHeartRate).toBeNull();
    expect(item.maxHeartRate).toBeNull();
  });
});

describe("listWorkouts", () => {
  it("queries the trailing day window ending today, newest first, take = limit", async () => {
    await listWorkouts(30, 10);

    const end = todayLocal();
    const start = shiftDay(end, -29);
    expect(workoutFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { day: { gte: dayToDbDate(start), lte: dayToDbDate(end) } },
        orderBy: { startedAt: "desc" },
        take: 10,
      }),
    );
  });

  it("defaults the limit to 50 and clamps it to 200", async () => {
    await listWorkouts(30);
    expect(workoutFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 50 }),
    );

    await listWorkouts(30, 9999);
    expect(workoutFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 200 }),
    );
  });

  it("returns the rows serialized in query order", async () => {
    workoutFindMany.mockResolvedValue([
      workoutRow({ id: "w2", startedAt: new Date("2026-06-21T07:00:00.000Z") }),
      workoutRow({ id: "w1" }),
    ]);

    const items = await listWorkouts(7);

    expect(items.map((w) => w.id)).toEqual(["w2", "w1"]);
    expect(items[0]).toMatchObject({
      startedAt: "2026-06-21T07:00:00.000Z",
      day: "2026-06-20",
    });
  });
});
