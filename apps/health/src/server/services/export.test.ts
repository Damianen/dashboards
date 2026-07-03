import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { dayToDbDate } from "@/lib/dates";
import { buildExport } from "./export";

type FindMany = (args: unknown) => Promise<unknown[]>;

const weightFindMany = vi.fn<FindMany>();
const sleepSessionFindMany = vi.fn<FindMany>();
const dailySleepFindMany = vi.fn<FindMany>();
const readinessFindMany = vi.fn<FindMany>();
const activityFindMany = vi.fn<FindMany>();
const workoutFindMany = vi.fn<FindMany>();
const foodEntryFindMany = vi.fn<FindMany>();
const foodProductFindMany = vi.fn<FindMany>();
const customFoodFindMany = vi.fn<FindMany>();
const mealFindMany = vi.fn<FindMany>();
const dailyPlanFindMany = vi.fn<FindMany>();
const waterFindMany = vi.fn<FindMany>();
const stimulantFindMany = vi.fn<FindMany>();
const supplementFindMany = vi.fn<FindMany>();
const supplementLogFindMany = vi.fn<FindMany>();
const supplementEntryFindMany = vi.fn<FindMany>();
const exerciseFindMany = vi.fn<FindMany>();
const liftingSessionFindMany = vi.fn<FindMany>();
const templateFindMany = vi.fn<FindMany>();
const settingFindMany = vi.fn<FindMany>();

// The mock deliberately has NO oauthToken / pushSubscription / notified* /
// syncRun accessors: if the export service ever touched them, the test run
// would crash on the undefined model.
vi.mock("@/server/db", () => ({
  prisma: {
    weightMeasurement: { findMany: (args: unknown) => weightFindMany(args) },
    sleepSession: { findMany: (args: unknown) => sleepSessionFindMany(args) },
    dailySleep: { findMany: (args: unknown) => dailySleepFindMany(args) },
    dailyReadiness: { findMany: (args: unknown) => readinessFindMany(args) },
    dailyActivity: { findMany: (args: unknown) => activityFindMany(args) },
    workout: { findMany: (args: unknown) => workoutFindMany(args) },
    foodEntry: { findMany: (args: unknown) => foodEntryFindMany(args) },
    foodProduct: { findMany: (args: unknown) => foodProductFindMany(args) },
    customFood: { findMany: (args: unknown) => customFoodFindMany(args) },
    meal: { findMany: (args: unknown) => mealFindMany(args) },
    dailyPlan: { findMany: (args: unknown) => dailyPlanFindMany(args) },
    waterEntry: { findMany: (args: unknown) => waterFindMany(args) },
    stimulantEntry: { findMany: (args: unknown) => stimulantFindMany(args) },
    supplement: { findMany: (args: unknown) => supplementFindMany(args) },
    supplementLog: {
      findMany: (args: unknown) => supplementLogFindMany(args),
    },
    supplementEntry: {
      findMany: (args: unknown) => supplementEntryFindMany(args),
    },
    exercise: { findMany: (args: unknown) => exerciseFindMany(args) },
    liftingSession: {
      findMany: (args: unknown) => liftingSessionFindMany(args),
    },
    workoutTemplate: { findMany: (args: unknown) => templateFindMany(args) },
    setting: { findMany: (args: unknown) => settingFindMany(args) },
  },
}));

const ALL_FIND_MANY = [
  weightFindMany,
  sleepSessionFindMany,
  dailySleepFindMany,
  readinessFindMany,
  activityFindMany,
  workoutFindMany,
  foodEntryFindMany,
  foodProductFindMany,
  customFoodFindMany,
  mealFindMany,
  dailyPlanFindMany,
  waterFindMany,
  stimulantFindMany,
  supplementFindMany,
  supplementLogFindMany,
  supplementEntryFindMany,
  exerciseFindMany,
  liftingSessionFindMany,
  templateFindMany,
  settingFindMany,
];

const ALL_DOMAINS = [
  "weight",
  "sleep",
  "readiness",
  "activity",
  "workouts",
  "food",
  "food_products",
  "custom_foods",
  "meals",
  "daily_plans",
  "water",
  "stimulants",
  "supplements",
  "lifting",
  "templates",
  "settings",
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of ALL_FIND_MANY) fn.mockResolvedValue([]);
});

const DAY = new Date("2026-07-01T00:00:00.000Z");

function weightRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "wm1",
    measuredAt: new Date("2026-07-01T06:12:00.000Z"),
    day: DAY,
    weightKg: new Prisma.Decimal("82.53"),
    bodyFatPct: new Prisma.Decimal("18.2"),
    muscleMassKg: null,
    hydrationKg: null,
    boneMassKg: null,
    source: "WITHINGS",
    externalId: "w-ext-1",
    raw: { vendor: "withings", grpid: 7 },
    createdAt: new Date("2026-07-01T06:13:00.000Z"),
    ...overrides,
  };
}

function sleepSessionRow() {
  return {
    id: "ss1",
    day: DAY,
    bedtimeStart: new Date("2026-06-30T21:58:00.000Z"),
    bedtimeEnd: new Date("2026-07-01T05:40:00.000Z"),
    totalSleepMin: 430,
    deepMin: 90,
    remMin: 100,
    lightMin: 240,
    awakeMin: 32,
    efficiency: 93,
    latencySec: 480,
    avgHrBpm: new Prisma.Decimal("52.75"),
    avgHrvMs: 68,
    lowestHrBpm: 46,
    source: "OURA",
    externalId: "oura-1",
    raw: { vendor: "oura" },
    createdAt: new Date("2026-07-01T06:00:00.000Z"),
  };
}

describe("buildExport serialization", () => {
  it("coerces Decimals to numbers, day to a civil string and timestamps to ISO", async () => {
    weightFindMany.mockResolvedValue([weightRow()]);

    const bundle = await buildExport({ domains: ["weight"], includeRaw: true });

    expect(bundle.domains.weight).toEqual([
      {
        id: "wm1",
        measuredAt: "2026-07-01T06:12:00.000Z",
        day: "2026-07-01",
        weightKg: 82.53,
        bodyFatPct: 18.2,
        muscleMassKg: null,
        hydrationKg: null,
        boneMassKg: null,
        source: "WITHINGS",
        externalId: "w-ext-1",
        raw: { vendor: "withings", grpid: 7 },
        createdAt: "2026-07-01T06:13:00.000Z",
      },
    ]);
  });

  it("serializes nested lifting sessions (sets + plan items + warmups) with numeric weights", async () => {
    exerciseFindMany.mockResolvedValue([
      { id: "ex1", name: "Squat", muscleGroup: "legs" },
    ]);
    liftingSessionFindMany.mockResolvedValue([
      {
        id: "ls1",
        day: DAY,
        startedAt: new Date("2026-07-01T17:00:00.000Z"),
        endedAt: null,
        notes: null,
        templateId: "t1",
        sets: [
          {
            id: "set1",
            sessionId: "ls1",
            exerciseId: "ex1",
            setNumber: 1,
            reps: 5,
            weightKg: new Prisma.Decimal("102.50"),
            rpe: new Prisma.Decimal("8.5"),
            isWarmup: false,
            loggedAt: new Date("2026-07-01T17:05:00.000Z"),
            origin: "PWA",
          },
        ],
        planItems: [
          {
            id: "pi1",
            sessionId: "ls1",
            exerciseId: "ex1",
            position: 1,
            targetType: "REPS",
            targetSets: 3,
            repMin: 5,
            repMax: 8,
            targetWeightKg: new Prisma.Decimal("100.00"),
            weightIncrementKg: new Prisma.Decimal("2.50"),
            targetVolumeKg: null,
            warmups: [
              {
                id: "wu1",
                planItemId: "pi1",
                position: 1,
                reps: 10,
                weightMode: "PERCENT",
                weightKg: null,
                percentOfWorking: new Prisma.Decimal("50.00"),
              },
            ],
          },
        ],
      },
    ]);

    const bundle = await buildExport({
      domains: ["lifting"],
      includeRaw: false,
    });

    expect(bundle.domains.lifting).toEqual({
      exercises: [{ id: "ex1", name: "Squat", muscleGroup: "legs" }],
      sessions: [
        {
          id: "ls1",
          day: "2026-07-01",
          startedAt: "2026-07-01T17:00:00.000Z",
          endedAt: null,
          notes: null,
          templateId: "t1",
          sets: [
            {
              id: "set1",
              sessionId: "ls1",
              exerciseId: "ex1",
              setNumber: 1,
              reps: 5,
              weightKg: 102.5,
              rpe: 8.5,
              isWarmup: false,
              loggedAt: "2026-07-01T17:05:00.000Z",
              origin: "PWA",
            },
          ],
          planItems: [
            {
              id: "pi1",
              sessionId: "ls1",
              exerciseId: "ex1",
              position: 1,
              targetType: "REPS",
              targetSets: 3,
              repMin: 5,
              repMax: 8,
              targetWeightKg: 100,
              weightIncrementKg: 2.5,
              targetVolumeKg: null,
              warmups: [
                {
                  id: "wu1",
                  planItemId: "pi1",
                  position: 1,
                  reps: 10,
                  weightMode: "PERCENT",
                  weightKg: null,
                  percentOfWorking: 50,
                },
              ],
            },
          ],
        },
      ],
    });
    expect(bundle.counts.lifting).toBe(1);
  });
});

describe("buildExport includeRaw", () => {
  it("includes raw vendor blobs (null kept) when includeRaw is true", async () => {
    weightFindMany.mockResolvedValue([weightRow(), weightRow({ id: "wm2", raw: null })]);
    sleepSessionFindMany.mockResolvedValue([sleepSessionRow()]);
    dailySleepFindMany.mockResolvedValue([
      {
        day: DAY,
        score: 84,
        raw: { contributors: {} },
        updatedAt: new Date("2026-07-01T06:00:00.000Z"),
      },
    ]);

    const bundle = await buildExport({
      domains: ["weight", "sleep"],
      includeRaw: true,
    });

    expect(bundle.domains.weight?.[0]?.raw).toEqual({
      vendor: "withings",
      grpid: 7,
    });
    expect(bundle.domains.weight?.[1]?.raw).toBeNull();
    expect(bundle.domains.sleep?.sessions[0]?.raw).toEqual({ vendor: "oura" });
    expect(bundle.domains.sleep?.dailyScores[0]?.raw).toEqual({
      contributors: {},
    });
    expect(bundle.includeRaw).toBe(true);
  });

  it("omits the raw key entirely when includeRaw is false", async () => {
    weightFindMany.mockResolvedValue([weightRow()]);
    sleepSessionFindMany.mockResolvedValue([sleepSessionRow()]);
    foodProductFindMany.mockResolvedValue([
      {
        barcode: "871",
        name: "Kwark",
        brand: null,
        imageUrl: null,
        per100g: { kcal: 60 },
        servingG: new Prisma.Decimal("250.0"),
        raw: { off: "payload" },
        fetchedAt: new Date("2026-06-01T10:00:00.000Z"),
      },
    ]);

    const bundle = await buildExport({
      domains: ["weight", "sleep", "food_products"],
      includeRaw: false,
    });

    expect("raw" in bundle.domains.weight![0]!).toBe(false);
    expect("raw" in bundle.domains.sleep!.sessions[0]!).toBe(false);
    expect("raw" in bundle.domains.food_products![0]!).toBe(false);
    // The structured per100g cache is data, not a vendor blob — it stays.
    expect(bundle.domains.food_products?.[0]?.per100g).toEqual({ kcal: 60 });
    expect(bundle.includeRaw).toBe(false);
  });
});

describe("buildExport range filtering", () => {
  const FROM = "2026-06-01";
  const TO = "2026-06-30";
  const RANGE_WHERE = {
    day: { gte: dayToDbDate(FROM), lte: dayToDbDate(TO) },
  };

  it("applies the day range to every time-series model, including both sleep tables", async () => {
    await buildExport({
      domains: ["weight", "sleep", "food", "water"],
      from: FROM,
      to: TO,
      includeRaw: false,
    });

    expect(weightFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: RANGE_WHERE }),
    );
    expect(sleepSessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: RANGE_WHERE }),
    );
    expect(dailySleepFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: RANGE_WHERE }),
    );
    expect(foodEntryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: RANGE_WHERE }),
    );
    expect(waterFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: RANGE_WHERE }),
    );
  });

  it("filters supplement logs + legacy entries but never the catalog; lifting sessions but never exercises", async () => {
    await buildExport({
      domains: ["supplements", "lifting"],
      from: FROM,
      to: TO,
      includeRaw: false,
    });

    expect(supplementLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: RANGE_WHERE }),
    );
    expect(supplementEntryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: RANGE_WHERE }),
    );
    expect(supplementFindMany).toHaveBeenCalledWith({
      orderBy: [{ timeGroup: "asc" }, { position: "asc" }],
    });
    expect(liftingSessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: RANGE_WHERE }),
    );
    expect(exerciseFindMany).toHaveBeenCalledWith({
      orderBy: { name: "asc" },
    });
  });

  it("supports an open-ended range (from only)", async () => {
    await buildExport({ domains: ["water"], from: FROM, includeRaw: false });

    expect(waterFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { day: { gte: dayToDbDate(FROM) } },
      }),
    );
  });

  it("queries unbounded when no range is given and reports range: null", async () => {
    const bundle = await buildExport({
      domains: ["water"],
      includeRaw: false,
    });

    expect(waterFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
    expect(bundle.range).toBeNull();
  });

  it("echoes a half-open range with the missing side null", async () => {
    const bundle = await buildExport({
      domains: ["settings"],
      from: FROM,
      includeRaw: false,
    });

    expect(bundle.range).toEqual({ from: FROM, to: null });
  });
});

describe("buildExport domain selection and counts", () => {
  it("fetches ONLY the selected domains", async () => {
    waterFindMany.mockResolvedValue([
      {
        id: "wa1",
        loggedAt: new Date("2026-07-01T09:00:00.000Z"),
        day: DAY,
        amountMl: 250,
        origin: "PWA",
      },
    ]);

    const bundle = await buildExport({ domains: ["water"], includeRaw: true });

    expect(waterFindMany).toHaveBeenCalledTimes(1);
    for (const fn of ALL_FIND_MANY) {
      if (fn !== waterFindMany) expect(fn).not.toHaveBeenCalled();
    }
    expect(Object.keys(bundle.domains)).toEqual(["water"]);
    expect(bundle.counts).toEqual({ water: 1 });
    expect(bundle.domains.water).toEqual([
      {
        id: "wa1",
        loggedAt: "2026-07-01T09:00:00.000Z",
        day: "2026-07-01",
        amountMl: 250,
        origin: "PWA",
      },
    ]);
  });

  it("counts the primary collection of grouped domains", async () => {
    sleepSessionFindMany.mockResolvedValue([sleepSessionRow(), sleepSessionRow()]);
    dailySleepFindMany.mockResolvedValue([
      { day: DAY, score: 84, raw: null, updatedAt: new Date() },
    ]);
    supplementFindMany.mockResolvedValue([
      {
        id: "sup1",
        name: "Creatine",
        dose: new Prisma.Decimal("5.00"),
        unit: "g",
        caffeineMg: null,
        timeGroup: "MORNING",
        position: 1,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    supplementLogFindMany.mockResolvedValue([
      {
        id: "log1",
        supplementId: "sup1",
        day: DAY,
        takenAt: new Date("2026-07-01T07:00:00.000Z"),
        doseSnapshot: new Prisma.Decimal("5.00"),
        unitSnapshot: "g",
        caffeineSnapshot: null,
        origin: "MCP",
      },
      {
        id: "log2",
        supplementId: "sup1",
        day: DAY,
        takenAt: new Date("2026-07-01T07:01:00.000Z"),
        doseSnapshot: new Prisma.Decimal("5.00"),
        unitSnapshot: "g",
        caffeineSnapshot: null,
        origin: "MCP",
      },
    ]);
    supplementEntryFindMany.mockResolvedValue([
      {
        id: "leg1",
        loggedAt: new Date("2025-01-01T08:00:00.000Z"),
        day: new Date("2025-01-01T00:00:00.000Z"),
        name: "Vitamin D",
        dose: new Prisma.Decimal("25.00"),
        unit: "µg",
        origin: "PWA",
      },
    ]);

    const bundle = await buildExport({
      domains: ["sleep", "supplements"],
      includeRaw: false,
    });

    expect(bundle.counts).toEqual({ sleep: 2, supplements: 2 });
    expect(bundle.domains.supplements?.catalog).toHaveLength(1);
    expect(bundle.domains.supplements?.legacyEntries).toEqual([
      {
        id: "leg1",
        loggedAt: "2025-01-01T08:00:00.000Z",
        day: "2025-01-01",
        name: "Vitamin D",
        dose: 25,
        unit: "µg",
        origin: "PWA",
      },
    ]);
  });
});

describe("buildExport envelope and secret guard", () => {
  it("emits the full envelope and never leaks token or push-subscription fields", async () => {
    weightFindMany.mockResolvedValue([weightRow()]);
    settingFindMany.mockResolvedValue([
      { key: "water.baseTargetMl", value: 2500, updatedAt: new Date() },
    ]);

    const bundle = await buildExport({
      domains: [...ALL_DOMAINS],
      includeRaw: true,
    });

    expect(bundle.app).toBe("health");
    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.timezone).toBe("Europe/Amsterdam");
    expect(Number.isNaN(Date.parse(bundle.exportedAt))).toBe(false);
    expect(Object.keys(bundle.domains).sort()).toEqual(
      [...ALL_DOMAINS].sort(),
    );

    const json = JSON.stringify(bundle);
    expect(json).not.toContain("accessTokenEnc");
    expect(json).not.toContain("refreshTokenEnc");
    expect(json).not.toContain("p256dh");
  });
});
