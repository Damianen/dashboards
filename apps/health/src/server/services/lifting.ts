import {
  EntryOrigin,
  type Exercise,
  type LiftingSet,
  Prisma,
} from "@/generated/prisma/client";
import { dayOf, dayToDbDate, todayLocal } from "@/lib/dates";
import {
  type ExerciseGroup,
  groupSetsByExercise,
  type PlainSet,
  sessionVolumeKg,
  sessionWorkingSets,
} from "@/lib/lifting-grouping";
import {
  type PlanProgress,
  type PlanTarget,
  shouldReuseSession,
  summarizePlanProgress,
} from "@/lib/rules";
import {
  type CreateExerciseInput,
  createExerciseSchema,
} from "@/lib/schemas/exercise";
import {
  logSetSchema,
  type LogSetInput,
  updateSetSchema,
  type UpdateSetInput,
} from "@/lib/schemas/lifting";
import { suggestNextSet } from "@/lib/progression";
import { suggestWarmupSet } from "@/lib/warmup";
import { prisma } from "@/server/db";
import { DomainError, NotFoundError } from "./errors";

// Resolve an exercise by id or case-insensitive name. Never auto-creates.
async function resolveExercise(
  exerciseId: string | undefined,
  exerciseName: string | undefined,
): Promise<Exercise> {
  const exercise = exerciseId
    ? await prisma.exercise.findUnique({ where: { id: exerciseId } })
    : await prisma.exercise.findFirst({
        where: { name: { equals: exerciseName, mode: "insensitive" } },
      });
  if (!exercise) {
    throw new NotFoundError("exercise", exerciseId ?? exerciseName);
  }
  return exercise;
}

export async function logSet(
  input: LogSetInput,
  origin: EntryOrigin,
): Promise<LiftingSet> {
  const data = logSetSchema.parse(input);
  const exercise = await resolveExercise(data.exerciseId, data.exerciseName);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const latest = await tx.liftingSession.findFirst({
      orderBy: { startedAt: "desc" },
    });
    const session =
      latest && shouldReuseSession(latest.startedAt, now)
        ? latest
        : await tx.liftingSession.create({
            data: { day: dayToDbDate(dayOf(now)), startedAt: now },
          });

    // setNumber is per-exercise within the session.
    const priorSets = await tx.liftingSet.count({
      where: { sessionId: session.id, exerciseId: exercise.id },
    });

    return tx.liftingSet.create({
      data: {
        sessionId: session.id,
        exerciseId: exercise.id,
        setNumber: priorSets + 1,
        reps: data.reps,
        weightKg: data.weightKg,
        rpe: data.rpe,
        isWarmup: data.isWarmup,
        loggedAt: now,
        origin,
      },
    });
  });
}

/** Edit an already-logged set in place. Only the provided fields change; the
 *  set's session, exercise and setNumber are immutable here. NotFound → 404. */
export async function updateSet(
  id: string,
  input: UpdateSetInput,
): Promise<LiftingSet> {
  const data = updateSetSchema.parse(input);
  try {
    return await prisma.liftingSet.update({
      where: { id },
      data: {
        reps: data.reps,
        weightKg: data.weightKg,
        rpe: data.rpe,
        isWarmup: data.isWarmup,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      throw new NotFoundError("set", id);
    }
    throw err;
  }
}

/** Delete a logged set. setNumber is display-order only (the logger renumbers
 *  rows by position), so a resulting gap is harmless. NotFound → 404. */
export async function deleteSet(id: string): Promise<void> {
  try {
    await prisma.liftingSet.delete({ where: { id } });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      throw new NotFoundError("set", id);
    }
    throw err;
  }
}

/** Mark a session finished (stamp endedAt) and return its full detail. Idempotent
 *  re-stamping is fine — finishing twice just updates the timestamp. */
export async function finishSession(id: string): Promise<SessionDetail> {
  try {
    await prisma.liftingSession.update({
      where: { id },
      data: { endedAt: new Date() },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      throw new NotFoundError("session", id);
    }
    throw err;
  }
  return getSession(id);
}

export interface SessionHistory {
  sessionId: string;
  day: string;
  startedAt: Date;
  sets: LiftingSet[];
  volumeKg: number;
}

/** The last `limit` sessions containing the named exercise, newest first, with that
 *  exercise's sets and working-set volume per session. */
export async function getHistory(
  exerciseName: string,
  limit = 10,
): Promise<SessionHistory[]> {
  const exercise = await resolveExercise(undefined, exerciseName);
  const sessions = await prisma.liftingSession.findMany({
    where: { sets: { some: { exerciseId: exercise.id } } },
    orderBy: { startedAt: "desc" },
    take: limit,
    include: {
      sets: {
        where: { exerciseId: exercise.id },
        orderBy: { setNumber: "asc" },
      },
    },
  });
  return sessions.map((session) => ({
    sessionId: session.id,
    day: dayOf(session.day),
    startedAt: session.startedAt,
    sets: session.sets,
    volumeKg: session.sets
      .filter((s) => !s.isWarmup)
      .reduce((sum, s) => sum + s.reps * Number(s.weightKg), 0),
  }));
}

/** One actual set from a prior session (Decimal weight coerced). */
export interface PreviousSet {
  reps: number;
  weightKg: number;
  isWarmup: boolean;
}

/**
 * The full set list (warmups and working, ordered by set number) of the most
 * recent session strictly before `beforeDay` in which this exercise had at least
 * one *working* set. It backs both the logger's "Previous" column and the
 * progression suggestions, so the two always agree on which session "last time"
 * was. `[]` when there's no such prior session. `beforeDay` (today's civil day)
 * keeps an in-progress session from ever referencing itself.
 */
export async function getLastPerformedSets(
  exerciseId: string,
  beforeDay: string,
): Promise<PreviousSet[]> {
  const session = await prisma.liftingSession.findFirst({
    where: {
      day: { lt: dayToDbDate(beforeDay) },
      sets: { some: { exerciseId, isWarmup: false } },
    },
    orderBy: { startedAt: "desc" },
    include: {
      sets: { where: { exerciseId }, orderBy: { setNumber: "asc" } },
    },
  });
  if (!session) return [];
  return session.sets.map((s) => ({
    reps: s.reps,
    weightKg: Number(s.weightKg),
    isWarmup: s.isWarmup,
  }));
}

/** The `position`-th working set (ordered by set number, warmups excluded) of an
 *  exercise in the most recent prior session, falling back to the highest
 *  available position when fewer working sets existed; null when there's no prior
 *  history. Derived from getLastPerformedSets so the Previous column and the
 *  suggestions read from the same session. */
export function lastWorkingSetAt(
  previous: PreviousSet[],
  position: number,
): { reps: number; weightKg: number } | null {
  const working = previous.filter((s) => !s.isWarmup);
  if (working.length === 0) return null;
  const set = working[Math.min(position, working.length) - 1];
  return set ? { reps: set.reps, weightKg: set.weightKg } : null;
}

export async function getLastWorkingSet(
  exerciseId: string,
  position: number,
  beforeDay: string,
): Promise<{ reps: number; weightKg: number } | null> {
  return lastWorkingSetAt(
    await getLastPerformedSets(exerciseId, beforeDay),
    position,
  );
}

/** The `position`-th warmup set (1-based, ordered by set number, working sets
 *  excluded) of an exercise in the most recent prior session; null when there was
 *  no warmup at that position. Mirrors lastWorkingSetAt and reads the same
 *  getLastPerformedSets list, so the warmup "Previous" column and the warmup
 *  prefills always agree on which session "last time" was. */
export function lastWarmupSetAt(
  previous: PreviousSet[],
  position: number,
): { reps: number; weightKg: number } | null {
  const warmups = previous.filter((s) => s.isWarmup);
  const set = warmups[position - 1];
  return set ? { reps: set.reps, weightKg: set.weightKg } : null;
}

export async function getLastWarmupSet(
  exerciseId: string,
  position: number,
  beforeDay: string,
): Promise<{ reps: number; weightKg: number } | null> {
  return lastWarmupSetAt(
    await getLastPerformedSets(exerciseId, beforeDay),
    position,
  );
}

export interface SessionView {
  sessionId: string;
  day: string;
  startedAt: Date;
  endedAt: Date | null;
  volumeKg: number;
  workingSets: number;
  exercises: ExerciseGroup[];
}

/** Sessions with their sets grouped by exercise and per-session working volume.
 *  With `day`, returns every session on that civil day (a >3h gap splits one day
 *  into multiple sessions); without it, the most recent `limit` sessions, newest
 *  first. Prisma.Decimal weights are coerced to numbers here so the client never
 *  sees decimal strings. */
export async function listSessions(
  day?: string,
  limit = 10,
): Promise<SessionView[]> {
  const sessions = await prisma.liftingSession.findMany({
    where: day ? { day: dayToDbDate(day) } : {},
    orderBy: { startedAt: "desc" },
    take: day ? undefined : limit,
    include: {
      // loggedAt asc gives groupSetsByExercise its first-appearance ordering.
      sets: {
        orderBy: { loggedAt: "asc" },
        include: { exercise: { select: { id: true, name: true } } },
      },
    },
  });

  return sessions.map((session) => {
    const plain: PlainSet[] = session.sets.map((s) => ({
      id: s.id,
      exerciseId: s.exerciseId,
      exerciseName: s.exercise.name,
      setNumber: s.setNumber,
      reps: s.reps,
      weightKg: Number(s.weightKg),
      rpe: s.rpe == null ? null : Number(s.rpe),
      isWarmup: s.isWarmup,
    }));
    const exercises = groupSetsByExercise(plain);
    return {
      sessionId: session.id,
      day: dayOf(session.day),
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      volumeKg: sessionVolumeKg(exercises),
      workingSets: sessionWorkingSets(exercises),
      exercises,
    };
  });
}

/** A session's plan snapshot for one exercise (targets only — Decimals coerced). */
export interface SessionPlanTargetView {
  position: number;
  targetType: "REPS" | "VOLUME";
  targetSets: number | null;
  repMin: number | null;
  repMax: number | null;
  targetWeightKg: number | null;
  weightIncrementKg: number | null;
  targetVolumeKg: number | null;
}

/** A progressive-overload prefill for one target set position (never persisted —
 *  an editable default the UI seeds the reps/weight inputs with). */
export interface SetSuggestion {
  position: number;
  reps: number;
  weightKg: number | null;
  weightIncreased: boolean;
}

/** A prefill for one defined warmup set (never persisted). reps/weight come from
 *  last session's warmup at this position, else from the template definition (% of
 *  working weight resolved to kg, or null when there's no working weight). */
export interface WarmupSuggestion {
  position: number;
  reps: number;
  weightKg: number | null;
}

/** One exercise in a session: its plan snapshot (null if unplanned), the sets
 *  logged for it (null if planned but nothing logged yet), progress vs target
 *  (null when there's no plan to measure against), and per-position prefill
 *  suggestions (empty for VOLUME / unplanned exercises). */
export interface SessionExerciseView {
  exerciseId: string;
  exerciseName: string;
  plan: SessionPlanTargetView | null;
  sets: ExerciseGroup | null;
  progress: PlanProgress | null;
  suggestions: SetSuggestion[];
  /** Per-position prefills for this exercise's snapshotted warmup sets, rendered
   *  before the working sets. Empty when the plan defines no warmups. */
  warmupSuggestions: WarmupSuggestion[];
  /** The most recent prior session's actual sets for this exercise (warmups +
   *  working, ordered), powering the logger's "Previous" column. Empty if none. */
  previousSets: PreviousSet[];
}

export interface SessionDetail {
  sessionId: string;
  day: string;
  startedAt: Date;
  endedAt: Date | null;
  templateId: string | null;
  /** 1-based count of this template's sessions up to and including this one (for
   *  the "Push #3" title); null for ad-hoc sessions with no template. */
  templateOrdinal: number | null;
  volumeKg: number;
  workingSets: number;
  exercises: SessionExerciseView[];
}

/**
 * One session in full: its plan snapshot merged with the sets actually logged.
 * Planned exercises come first in plan order, each with its progress; exercises
 * logged that weren't in the plan follow (plan = null), in first-appearance order.
 */
export async function getSession(id: string): Promise<SessionDetail> {
  const session = await prisma.liftingSession.findUnique({
    where: { id },
    include: {
      planItems: {
        orderBy: { position: "asc" },
        include: {
          exercise: { select: { id: true, name: true, muscleGroup: true } },
          warmups: { orderBy: { position: "asc" } },
        },
      },
      sets: {
        orderBy: { loggedAt: "asc" },
        include: { exercise: { select: { id: true, name: true } } },
      },
    },
  });
  if (!session) throw new NotFoundError("session", id);

  const plain: PlainSet[] = session.sets.map((s) => ({
    id: s.id,
    exerciseId: s.exerciseId,
    exerciseName: s.exercise.name,
    setNumber: s.setNumber,
    reps: s.reps,
    weightKg: Number(s.weightKg),
    rpe: s.rpe == null ? null : Number(s.rpe),
    isWarmup: s.isWarmup,
  }));
  const groups = groupSetsByExercise(plain);
  const groupByExerciseId = new Map(groups.map((g) => [g.exerciseId, g]));

  const planTargets: PlanTarget[] = session.planItems.map((p) => ({
    exerciseId: p.exerciseId,
    targetType: p.targetType,
    targetSets: p.targetSets,
    repMin: p.repMin,
    repMax: p.repMax,
    targetVolumeKg: p.targetVolumeKg == null ? null : Number(p.targetVolumeKg),
  }));
  // progress[i] lines up with planItems[i] (summarizePlanProgress preserves order).
  const progress = summarizePlanProgress(planTargets, plain);

  // One prior-session lookup per exercise (planned and logged), reused for both
  // the "Previous" column and the progression suggestions so they never disagree.
  // beforeDay = today, so this in-progress session never feeds its own data.
  const beforeDay = todayLocal();
  const exerciseIds = new Set<string>([
    ...session.planItems.map((p) => p.exerciseId),
    ...groups.map((g) => g.exerciseId),
  ]);
  const previousByExercise = new Map<string, PreviousSet[]>();
  await Promise.all(
    [...exerciseIds].map(async (exerciseId) => {
      previousByExercise.set(
        exerciseId,
        await getLastPerformedSets(exerciseId, beforeDay),
      );
    }),
  );

  // Progressive-overload prefills, one per target set position, derived from the
  // cached prior working sets. Not persisted — editable defaults only.
  const planSuggestions: SetSuggestion[][] = session.planItems.map((p) => {
    if (
      p.targetType !== "REPS" ||
      p.targetSets == null ||
      p.repMin == null ||
      p.repMax == null
    ) {
      return [];
    }
    const plan = {
      repMin: p.repMin,
      repMax: p.repMax,
      incrementKg:
        p.weightIncrementKg == null ? 2.5 : Number(p.weightIncrementKg),
      startWeightKg: p.targetWeightKg == null ? null : Number(p.targetWeightKg),
    };
    const previous = previousByExercise.get(p.exerciseId) ?? [];
    return Array.from({ length: p.targetSets }, (_, i) => i + 1).map(
      (position) => ({
        position,
        ...suggestNextSet(lastWorkingSetAt(previous, position), plan),
      }),
    );
  });

  // Warmup prefills, one per snapshotted warmup definition (rendered before the
  // working sets). Each reuses last session's warmup at that position, else resolves
  // the definition against the WORKING WEIGHT — the set-1 progression suggestion (it
  // already folds in the snapshotted targetWeightKg), null when there's neither.
  const planWarmupSuggestions: WarmupSuggestion[][] = session.planItems.map(
    (p, i) => {
      if (p.warmups.length === 0) return [];
      const workingWeight =
        planSuggestions[i]?.[0]?.weightKg ??
        (p.targetWeightKg == null ? null : Number(p.targetWeightKg));
      const previous = previousByExercise.get(p.exerciseId) ?? [];
      return p.warmups.map((w, idx) => {
        const position = idx + 1;
        const def = {
          reps: w.reps,
          weightMode: w.weightMode,
          weightKg: w.weightKg == null ? null : Number(w.weightKg),
          percentOfWorking:
            w.percentOfWorking == null ? null : Number(w.percentOfWorking),
        };
        return {
          position,
          ...suggestWarmupSet(lastWarmupSetAt(previous, position), def, workingWeight),
        };
      });
    },
  );

  const templateOrdinal = session.templateId
    ? await prisma.liftingSession.count({
        where: {
          templateId: session.templateId,
          startedAt: { lte: session.startedAt },
        },
      })
    : null;

  const exercises: SessionExerciseView[] = [];
  const plannedExerciseIds = new Set<string>();
  session.planItems.forEach((p, i) => {
    plannedExerciseIds.add(p.exerciseId);
    exercises.push({
      exerciseId: p.exerciseId,
      exerciseName: p.exercise.name,
      plan: {
        position: p.position,
        targetType: p.targetType,
        targetSets: p.targetSets,
        repMin: p.repMin,
        repMax: p.repMax,
        targetWeightKg:
          p.targetWeightKg == null ? null : Number(p.targetWeightKg),
        weightIncrementKg:
          p.weightIncrementKg == null ? null : Number(p.weightIncrementKg),
        targetVolumeKg:
          p.targetVolumeKg == null ? null : Number(p.targetVolumeKg),
      },
      sets: groupByExerciseId.get(p.exerciseId) ?? null,
      progress: progress[i] ?? null,
      suggestions: planSuggestions[i] ?? [],
      warmupSuggestions: planWarmupSuggestions[i] ?? [],
      previousSets: previousByExercise.get(p.exerciseId) ?? [],
    });
  });
  for (const g of groups) {
    if (plannedExerciseIds.has(g.exerciseId)) continue;
    exercises.push({
      exerciseId: g.exerciseId,
      exerciseName: g.exerciseName,
      plan: null,
      sets: g,
      progress: null,
      suggestions: [],
      warmupSuggestions: [],
      previousSets: previousByExercise.get(g.exerciseId) ?? [],
    });
  }

  return {
    sessionId: session.id,
    day: dayOf(session.day),
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    templateId: session.templateId,
    templateOrdinal,
    volumeKg: sessionVolumeKg(groups),
    workingSets: sessionWorkingSets(groups),
    exercises,
  };
}

export function listExercises(): Promise<Exercise[]> {
  return prisma.exercise.findMany({ orderBy: { name: "asc" } });
}

/** Add a new catalog exercise. Names are unique case-insensitively: the DB
 *  @unique on name is case-sensitive, so the findFirst is the real guard and the
 *  P2002 catch is just the exact-case race backstop. Refuses duplicates with a
 *  clean DomainError (→ 400). */
export async function createExercise(
  input: CreateExerciseInput,
): Promise<Exercise> {
  const data = createExerciseSchema.parse(input);
  const existing = await prisma.exercise.findFirst({
    where: { name: { equals: data.name, mode: "insensitive" } },
  });
  if (existing) {
    throw new DomainError(`an exercise named "${existing.name}" already exists`);
  }
  try {
    return await prisma.exercise.create({
      data: { name: data.name, muscleGroup: data.muscleGroup ?? null },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new DomainError(`an exercise named "${data.name}" already exists`);
    }
    throw err;
  }
}

/** Up to `limit` exercises whose name contains `query` (case-insensitive), for
 *  "did you mean…" suggestions when an exact match isn't found. Never auto-creates. */
export function suggestExercises(
  query: string,
  limit = 5,
): Promise<Exercise[]> {
  return prisma.exercise.findMany({
    where: { name: { contains: query, mode: "insensitive" } },
    orderBy: { name: "asc" },
    take: limit,
  });
}
