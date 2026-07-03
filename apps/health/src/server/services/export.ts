// Read-only bulk export of the user's health data, one explicit serializer per
// model so the wire shape is deliberate: Prisma Decimal → number (every Decimal
// column is at most precision 8 / scale 2, exact in a double), `@db.Date` day →
// civil "YYYY-MM-DD" string, timestamps → ISO instants. Vendor `raw` Json blobs
// are included only when asked (and never over MCP). OauthToken,
// PushSubscription, the Notified* bookkeeping tables and SyncRun are
// deliberately absent — exports must never carry secrets or operational state.

import type {
  CustomFood,
  DailyActivity,
  DailyReadiness,
  DailySleep,
  Exercise,
  FoodEntry,
  FoodProduct,
  Prisma,
  Setting,
  SleepSession,
  StimulantEntry,
  Supplement,
  SupplementEntry,
  SupplementLog,
  WaterEntry,
  WeightMeasurement,
  Workout,
} from "@/generated/prisma/client";
import { civilDay, dayToDbDate } from "@/lib/dates";
import type { ExportDomain } from "@/lib/schemas/export";
import { prisma } from "@/server/db";

export interface BuildExportOptions {
  /** Which domains to fetch — ONLY these are queried. */
  domains: ExportDomain[];
  /** Optional civil-day range applied to each time-series model's `day` column. */
  from?: string;
  to?: string;
  /** Include vendor `raw` Json blobs (weight/sleep/readiness/activity/workouts/
   *  food_products). When false the `raw` key is omitted entirely. */
  includeRaw: boolean;
}

export interface ExportRange {
  from: string | null;
  to: string | null;
}

export interface ExportBundle {
  app: "health";
  schemaVersion: 1;
  exportedAt: string;
  timezone: "Europe/Amsterdam";
  range: ExportRange | null;
  includeRaw: boolean;
  /** Rows per selected domain — for grouped domains, the primary collection
   *  (sleep → sessions, supplements → logs, lifting → sessions). */
  counts: Partial<Record<ExportDomain, number>>;
  domains: ExportDomainPayloads;
}

/** Payloads keyed by domain — only the selected domains are present. */
export interface ExportDomainPayloads {
  weight?: ReturnType<typeof serializeWeight>[];
  sleep?: {
    sessions: ReturnType<typeof serializeSleepSession>[];
    dailyScores: ReturnType<typeof serializeDailySleep>[];
  };
  readiness?: ReturnType<typeof serializeReadiness>[];
  activity?: ReturnType<typeof serializeActivity>[];
  workouts?: ReturnType<typeof serializeWorkout>[];
  food?: ReturnType<typeof serializeFoodEntry>[];
  food_products?: ReturnType<typeof serializeFoodProduct>[];
  custom_foods?: ReturnType<typeof serializeCustomFood>[];
  meals?: ReturnType<typeof serializeMeal>[];
  daily_plans?: ReturnType<typeof serializeDailyPlan>[];
  water?: ReturnType<typeof serializeWater>[];
  stimulants?: ReturnType<typeof serializeStimulant>[];
  supplements?: {
    catalog: ReturnType<typeof serializeSupplement>[];
    logs: ReturnType<typeof serializeSupplementLog>[];
    legacyEntries: ReturnType<typeof serializeSupplementEntry>[];
  };
  lifting?: {
    exercises: ReturnType<typeof serializeExercise>[];
    sessions: ReturnType<typeof serializeLiftingSession>[];
  };
  templates?: ReturnType<typeof serializeTemplate>[];
  settings?: ReturnType<typeof serializeSetting>[];
}

// ----- serializer helpers -----

/** Decimal → number. Lossless here: no exported column exceeds Decimal(8,2). */
function num(v: Prisma.Decimal): number {
  return Number(v);
}

function numOrNull(v: Prisma.Decimal | null): number | null {
  return v == null ? null : Number(v);
}

function isoOrNull(d: Date | null): string | null {
  return d == null ? null : d.toISOString();
}

/** The `raw` vendor blob: present (possibly null) when includeRaw, else absent. */
function rawField(
  includeRaw: boolean,
  raw: Prisma.JsonValue | null,
): { raw?: Prisma.JsonValue | null } {
  return includeRaw ? { raw } : {};
}

/** Prisma `where` for the civil-day range, or undefined when unbounded. */
function dayRangeFilter(
  from?: string,
  to?: string,
): { day: { gte?: Date; lte?: Date } } | undefined {
  if (from == null && to == null) return undefined;
  return {
    day: {
      ...(from != null && { gte: dayToDbDate(from) }),
      ...(to != null && { lte: dayToDbDate(to) }),
    },
  };
}

// ----- nested include shapes (typed once, reused by fetch + serializer) -----

const mealInclude = {
  items: { orderBy: { position: "asc" } },
} satisfies Prisma.MealInclude;
type MealRow = Prisma.MealGetPayload<{ include: typeof mealInclude }>;

const dailyPlanInclude = {
  items: { orderBy: { position: "asc" } },
} satisfies Prisma.DailyPlanInclude;
type DailyPlanRow = Prisma.DailyPlanGetPayload<{
  include: typeof dailyPlanInclude;
}>;

const liftingSessionInclude = {
  sets: { orderBy: { loggedAt: "asc" } },
  planItems: {
    orderBy: { position: "asc" },
    include: { warmups: { orderBy: { position: "asc" } } },
  },
} satisfies Prisma.LiftingSessionInclude;
type LiftingSessionRow = Prisma.LiftingSessionGetPayload<{
  include: typeof liftingSessionInclude;
}>;

const templateInclude = {
  exercises: {
    orderBy: { position: "asc" },
    include: { warmups: { orderBy: { position: "asc" } } },
  },
} satisfies Prisma.WorkoutTemplateInclude;
type TemplateRow = Prisma.WorkoutTemplateGetPayload<{
  include: typeof templateInclude;
}>;

// ----- per-model serializers -----

function serializeWeight(r: WeightMeasurement, includeRaw: boolean) {
  return {
    id: r.id,
    measuredAt: r.measuredAt.toISOString(),
    day: civilDay(r.day),
    weightKg: num(r.weightKg),
    bodyFatPct: numOrNull(r.bodyFatPct),
    muscleMassKg: numOrNull(r.muscleMassKg),
    hydrationKg: numOrNull(r.hydrationKg),
    boneMassKg: numOrNull(r.boneMassKg),
    source: r.source,
    externalId: r.externalId,
    ...rawField(includeRaw, r.raw),
    createdAt: r.createdAt.toISOString(),
  };
}

function serializeSleepSession(r: SleepSession, includeRaw: boolean) {
  return {
    id: r.id,
    day: civilDay(r.day),
    bedtimeStart: r.bedtimeStart.toISOString(),
    bedtimeEnd: r.bedtimeEnd.toISOString(),
    totalSleepMin: r.totalSleepMin,
    deepMin: r.deepMin,
    remMin: r.remMin,
    lightMin: r.lightMin,
    awakeMin: r.awakeMin,
    efficiency: r.efficiency,
    latencySec: r.latencySec,
    avgHrBpm: numOrNull(r.avgHrBpm),
    avgHrvMs: r.avgHrvMs,
    lowestHrBpm: r.lowestHrBpm,
    source: r.source,
    externalId: r.externalId,
    ...rawField(includeRaw, r.raw),
    createdAt: r.createdAt.toISOString(),
  };
}

function serializeDailySleep(r: DailySleep, includeRaw: boolean) {
  return {
    day: civilDay(r.day),
    score: r.score,
    ...rawField(includeRaw, r.raw),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function serializeReadiness(r: DailyReadiness, includeRaw: boolean) {
  return {
    day: civilDay(r.day),
    score: r.score,
    temperatureDeviation: numOrNull(r.temperatureDeviation),
    restingHrBpm: r.restingHrBpm,
    hrvBalance: r.hrvBalance,
    ...rawField(includeRaw, r.raw),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function serializeActivity(r: DailyActivity, includeRaw: boolean) {
  return {
    day: civilDay(r.day),
    activeKcal: r.activeKcal,
    totalKcal: r.totalKcal,
    steps: r.steps,
    source: r.source,
    ...rawField(includeRaw, r.raw),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function serializeWorkout(r: Workout, includeRaw: boolean) {
  return {
    id: r.id,
    externalId: r.externalId,
    source: r.source,
    type: r.type,
    name: r.name,
    startedAt: r.startedAt.toISOString(),
    endedAt: isoOrNull(r.endedAt),
    durationSeconds: r.durationSeconds,
    day: civilDay(r.day),
    distance: r.distance,
    activeEnergyKcal: r.activeEnergyKcal,
    avgHeartRate: r.avgHeartRate,
    maxHeartRate: r.maxHeartRate,
    ...rawField(includeRaw, r.raw),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function serializeFoodEntry(r: FoodEntry) {
  return {
    id: r.id,
    eatenAt: r.eatenAt.toISOString(),
    day: civilDay(r.day),
    productBarcode: r.productBarcode,
    customName: r.customName,
    customFoodId: r.customFoodId,
    mealId: r.mealId,
    portions: numOrNull(r.portions),
    quantityG: numOrNull(r.quantityG),
    kcal: num(r.kcal),
    proteinG: num(r.proteinG),
    carbG: num(r.carbG),
    fatG: num(r.fatG),
    fiberG: numOrNull(r.fiberG),
    sugarG: numOrNull(r.sugarG),
    saltG: numOrNull(r.saltG),
    caffeineMg: numOrNull(r.caffeineMg),
    meal: r.meal,
    origin: r.origin,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  };
}

function serializeFoodProduct(r: FoodProduct, includeRaw: boolean) {
  return {
    barcode: r.barcode,
    name: r.name,
    brand: r.brand,
    imageUrl: r.imageUrl,
    per100g: r.per100g,
    servingG: numOrNull(r.servingG),
    ...rawField(includeRaw, r.raw),
    fetchedAt: r.fetchedAt.toISOString(),
  };
}

function serializeCustomFood(r: CustomFood) {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    per100g: r.per100g,
    servingG: numOrNull(r.servingG),
    source: r.source,
    archived: r.archived,
    createdAt: r.createdAt.toISOString(),
  };
}

function serializeMealItem(it: MealRow["items"][number]) {
  return {
    id: it.id,
    mealId: it.mealId,
    position: it.position,
    productBarcode: it.productBarcode,
    customFoodId: it.customFoodId,
    customName: it.customName,
    childMealId: it.childMealId,
    quantityG: numOrNull(it.quantityG),
    childPortions: numOrNull(it.childPortions),
    kcal: numOrNull(it.kcal),
    proteinG: numOrNull(it.proteinG),
    carbG: numOrNull(it.carbG),
    fatG: numOrNull(it.fatG),
    fiberG: numOrNull(it.fiberG),
    sugarG: numOrNull(it.sugarG),
    saltG: numOrNull(it.saltG),
    caffeineMg: numOrNull(it.caffeineMg),
  };
}

function serializeMeal(m: MealRow) {
  return {
    id: m.id,
    name: m.name,
    notes: m.notes,
    yieldPortions: num(m.yieldPortions),
    perPortion: m.perPortion,
    archived: m.archived,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    items: m.items.map(serializeMealItem),
  };
}

function serializeDailyPlanItem(it: DailyPlanRow["items"][number]) {
  return {
    id: it.id,
    dailyPlanId: it.dailyPlanId,
    position: it.position,
    productBarcode: it.productBarcode,
    customFoodId: it.customFoodId,
    mealId: it.mealId,
    quantityG: numOrNull(it.quantityG),
    portions: numOrNull(it.portions),
    mealSlot: it.mealSlot,
  };
}

function serializeDailyPlan(p: DailyPlanRow) {
  return {
    id: p.id,
    name: p.name,
    notes: p.notes,
    archived: p.archived,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    items: p.items.map(serializeDailyPlanItem),
  };
}

function serializeWater(r: WaterEntry) {
  return {
    id: r.id,
    loggedAt: r.loggedAt.toISOString(),
    day: civilDay(r.day),
    amountMl: r.amountMl,
    origin: r.origin,
  };
}

function serializeStimulant(r: StimulantEntry) {
  return {
    id: r.id,
    loggedAt: r.loggedAt.toISOString(),
    day: civilDay(r.day),
    substance: r.substance,
    amountMg: num(r.amountMg),
    origin: r.origin,
    notes: r.notes,
  };
}

function serializeSupplement(s: Supplement) {
  return {
    id: s.id,
    name: s.name,
    dose: num(s.dose),
    unit: s.unit,
    caffeineMg: numOrNull(s.caffeineMg),
    timeGroup: s.timeGroup,
    position: s.position,
    archived: s.archived,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

function serializeSupplementLog(l: SupplementLog) {
  return {
    id: l.id,
    supplementId: l.supplementId,
    day: civilDay(l.day),
    takenAt: l.takenAt.toISOString(),
    doseSnapshot: num(l.doseSnapshot),
    unitSnapshot: l.unitSnapshot,
    caffeineSnapshot: numOrNull(l.caffeineSnapshot),
    origin: l.origin,
  };
}

function serializeSupplementEntry(e: SupplementEntry) {
  return {
    id: e.id,
    loggedAt: e.loggedAt.toISOString(),
    day: civilDay(e.day),
    name: e.name,
    dose: num(e.dose),
    unit: e.unit,
    origin: e.origin,
  };
}

function serializeExercise(e: Exercise) {
  return { id: e.id, name: e.name, muscleGroup: e.muscleGroup };
}

function serializeLiftingSet(s: LiftingSessionRow["sets"][number]) {
  return {
    id: s.id,
    sessionId: s.sessionId,
    exerciseId: s.exerciseId,
    setNumber: s.setNumber,
    reps: s.reps,
    weightKg: num(s.weightKg),
    rpe: numOrNull(s.rpe),
    isWarmup: s.isWarmup,
    loggedAt: s.loggedAt.toISOString(),
    origin: s.origin,
  };
}

function serializeSessionPlanItem(it: LiftingSessionRow["planItems"][number]) {
  return {
    id: it.id,
    sessionId: it.sessionId,
    exerciseId: it.exerciseId,
    position: it.position,
    targetType: it.targetType,
    targetSets: it.targetSets,
    repMin: it.repMin,
    repMax: it.repMax,
    targetWeightKg: numOrNull(it.targetWeightKg),
    weightIncrementKg: numOrNull(it.weightIncrementKg),
    targetVolumeKg: numOrNull(it.targetVolumeKg),
    restSec: it.restSec,
    warmups: it.warmups.map((w) => ({
      id: w.id,
      planItemId: w.planItemId,
      position: w.position,
      reps: w.reps,
      weightMode: w.weightMode,
      weightKg: numOrNull(w.weightKg),
      percentOfWorking: numOrNull(w.percentOfWorking),
    })),
  };
}

function serializeLiftingSession(s: LiftingSessionRow) {
  return {
    id: s.id,
    day: civilDay(s.day),
    startedAt: s.startedAt.toISOString(),
    endedAt: isoOrNull(s.endedAt),
    notes: s.notes,
    templateId: s.templateId,
    sets: s.sets.map(serializeLiftingSet),
    planItems: s.planItems.map(serializeSessionPlanItem),
  };
}

function serializeTemplateExercise(e: TemplateRow["exercises"][number]) {
  return {
    id: e.id,
    templateId: e.templateId,
    exerciseId: e.exerciseId,
    position: e.position,
    targetType: e.targetType,
    targetSets: e.targetSets,
    repMin: e.repMin,
    repMax: e.repMax,
    targetWeightKg: numOrNull(e.targetWeightKg),
    weightIncrementKg: numOrNull(e.weightIncrementKg),
    targetVolumeKg: numOrNull(e.targetVolumeKg),
    restSec: e.restSec,
    notes: e.notes,
    warmups: e.warmups.map((w) => ({
      id: w.id,
      templateExerciseId: w.templateExerciseId,
      position: w.position,
      reps: w.reps,
      weightMode: w.weightMode,
      weightKg: numOrNull(w.weightKg),
      percentOfWorking: numOrNull(w.percentOfWorking),
    })),
  };
}

function serializeTemplate(t: TemplateRow) {
  return {
    id: t.id,
    name: t.name,
    notes: t.notes,
    archived: t.archived,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    exercises: t.exercises.map(serializeTemplateExercise),
  };
}

function serializeSetting(s: Setting) {
  return { key: s.key, value: s.value, updatedAt: s.updatedAt.toISOString() };
}

// ----- the export builder -----

/**
 * Fetch and serialize the selected domains. Only selected domains are queried.
 * The day range applies to each time-series model's `day` column — for grouped
 * domains that's the logged rows (sleep sessions AND daily scores; supplement
 * logs and legacy entries; lifting sessions) while catalog halves (supplement
 * list, exercise list) ride along whole.
 */
export async function buildExport(
  opts: BuildExportOptions,
): Promise<ExportBundle> {
  const { domains, from, to, includeRaw } = opts;
  const dayWhere = dayRangeFilter(from, to);

  const counts: Partial<Record<ExportDomain, number>> = {};
  const payloads: ExportDomainPayloads = {};

  for (const domain of new Set(domains)) {
    switch (domain) {
      case "weight": {
        const rows = await prisma.weightMeasurement.findMany({
          where: dayWhere,
          orderBy: { measuredAt: "asc" },
        });
        payloads.weight = rows.map((r) => serializeWeight(r, includeRaw));
        counts.weight = rows.length;
        break;
      }
      case "sleep": {
        const [sessions, dailyScores] = await Promise.all([
          prisma.sleepSession.findMany({
            where: dayWhere,
            orderBy: { bedtimeStart: "asc" },
          }),
          prisma.dailySleep.findMany({
            where: dayWhere,
            orderBy: { day: "asc" },
          }),
        ]);
        payloads.sleep = {
          sessions: sessions.map((s) => serializeSleepSession(s, includeRaw)),
          dailyScores: dailyScores.map((d) => serializeDailySleep(d, includeRaw)),
        };
        counts.sleep = sessions.length;
        break;
      }
      case "readiness": {
        const rows = await prisma.dailyReadiness.findMany({
          where: dayWhere,
          orderBy: { day: "asc" },
        });
        payloads.readiness = rows.map((r) => serializeReadiness(r, includeRaw));
        counts.readiness = rows.length;
        break;
      }
      case "activity": {
        const rows = await prisma.dailyActivity.findMany({
          where: dayWhere,
          orderBy: { day: "asc" },
        });
        payloads.activity = rows.map((r) => serializeActivity(r, includeRaw));
        counts.activity = rows.length;
        break;
      }
      case "workouts": {
        const rows = await prisma.workout.findMany({
          where: dayWhere,
          orderBy: { startedAt: "asc" },
        });
        payloads.workouts = rows.map((r) => serializeWorkout(r, includeRaw));
        counts.workouts = rows.length;
        break;
      }
      case "food": {
        const rows = await prisma.foodEntry.findMany({
          where: dayWhere,
          orderBy: { eatenAt: "asc" },
        });
        payloads.food = rows.map(serializeFoodEntry);
        counts.food = rows.length;
        break;
      }
      case "food_products": {
        const rows = await prisma.foodProduct.findMany({
          orderBy: { barcode: "asc" },
        });
        payloads.food_products = rows.map((r) =>
          serializeFoodProduct(r, includeRaw),
        );
        counts.food_products = rows.length;
        break;
      }
      case "custom_foods": {
        const rows = await prisma.customFood.findMany({
          orderBy: { createdAt: "asc" },
        });
        payloads.custom_foods = rows.map(serializeCustomFood);
        counts.custom_foods = rows.length;
        break;
      }
      case "meals": {
        const rows = await prisma.meal.findMany({
          orderBy: { createdAt: "asc" },
          include: mealInclude,
        });
        payloads.meals = rows.map(serializeMeal);
        counts.meals = rows.length;
        break;
      }
      case "daily_plans": {
        const rows = await prisma.dailyPlan.findMany({
          orderBy: { createdAt: "asc" },
          include: dailyPlanInclude,
        });
        payloads.daily_plans = rows.map(serializeDailyPlan);
        counts.daily_plans = rows.length;
        break;
      }
      case "water": {
        const rows = await prisma.waterEntry.findMany({
          where: dayWhere,
          orderBy: { loggedAt: "asc" },
        });
        payloads.water = rows.map(serializeWater);
        counts.water = rows.length;
        break;
      }
      case "stimulants": {
        const rows = await prisma.stimulantEntry.findMany({
          where: dayWhere,
          orderBy: { loggedAt: "asc" },
        });
        payloads.stimulants = rows.map(serializeStimulant);
        counts.stimulants = rows.length;
        break;
      }
      case "supplements": {
        const [catalog, logs, legacyEntries] = await Promise.all([
          prisma.supplement.findMany({
            orderBy: [{ timeGroup: "asc" }, { position: "asc" }],
          }),
          prisma.supplementLog.findMany({
            where: dayWhere,
            orderBy: [{ day: "asc" }, { takenAt: "asc" }],
          }),
          prisma.supplementEntry.findMany({
            where: dayWhere,
            orderBy: { loggedAt: "asc" },
          }),
        ]);
        payloads.supplements = {
          catalog: catalog.map(serializeSupplement),
          logs: logs.map(serializeSupplementLog),
          legacyEntries: legacyEntries.map(serializeSupplementEntry),
        };
        counts.supplements = logs.length;
        break;
      }
      case "lifting": {
        const [exercises, sessions] = await Promise.all([
          prisma.exercise.findMany({ orderBy: { name: "asc" } }),
          prisma.liftingSession.findMany({
            where: dayWhere,
            orderBy: { startedAt: "asc" },
            include: liftingSessionInclude,
          }),
        ]);
        payloads.lifting = {
          exercises: exercises.map(serializeExercise),
          sessions: sessions.map(serializeLiftingSession),
        };
        counts.lifting = sessions.length;
        break;
      }
      case "templates": {
        const rows = await prisma.workoutTemplate.findMany({
          orderBy: { name: "asc" },
          include: templateInclude,
        });
        payloads.templates = rows.map(serializeTemplate);
        counts.templates = rows.length;
        break;
      }
      case "settings": {
        const rows = await prisma.setting.findMany({
          orderBy: { key: "asc" },
        });
        payloads.settings = rows.map(serializeSetting);
        counts.settings = rows.length;
        break;
      }
    }
  }

  return {
    app: "health",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    timezone: "Europe/Amsterdam",
    range:
      from == null && to == null
        ? null
        : { from: from ?? null, to: to ?? null },
    includeRaw,
    counts,
    domains: payloads,
  };
}
