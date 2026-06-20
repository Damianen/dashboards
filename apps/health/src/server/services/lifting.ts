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
import { logSetSchema, type LogSetInput } from "@/lib/schemas/lifting";
import { suggestNextSet } from "@/lib/progression";
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

/**
 * The `position`-th working set (isWarmup = false, ordered by set number) of an
 * exercise in the most recent session strictly before `beforeDay`. Falls back to
 * the highest available position when that session logged fewer working sets than
 * `position`; null when there's no prior history. `beforeDay` (today's civil day)
 * keeps an in-progress session from ever referencing itself.
 */
export async function getLastWorkingSet(
  exerciseId: string,
  position: number,
  beforeDay: string,
): Promise<{ reps: number; weightKg: number } | null> {
  const session = await prisma.liftingSession.findFirst({
    where: {
      day: { lt: dayToDbDate(beforeDay) },
      sets: { some: { exerciseId, isWarmup: false } },
    },
    orderBy: { startedAt: "desc" },
    include: {
      sets: {
        where: { exerciseId, isWarmup: false },
        orderBy: { setNumber: "asc" },
      },
    },
  });
  if (!session) return null;
  const set = session.sets[Math.min(position, session.sets.length) - 1];
  if (!set) return null;
  return { reps: set.reps, weightKg: Number(set.weightKg) };
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
}

export interface SessionDetail {
  sessionId: string;
  day: string;
  startedAt: Date;
  endedAt: Date | null;
  templateId: string | null;
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

  // Progressive-overload prefills, one per target set position, from the same
  // exercise + position in the most recent prior session. beforeDay = today, so
  // this in-progress session never feeds its own suggestions. Not persisted.
  const beforeDay = todayLocal();
  const planSuggestions: SetSuggestion[][] = await Promise.all(
    session.planItems.map((p) => {
      if (
        p.targetType !== "REPS" ||
        p.targetSets == null ||
        p.repMin == null ||
        p.repMax == null
      ) {
        return Promise.resolve<SetSuggestion[]>([]);
      }
      const plan = {
        repMin: p.repMin,
        repMax: p.repMax,
        incrementKg:
          p.weightIncrementKg == null ? 2.5 : Number(p.weightIncrementKg),
        startWeightKg:
          p.targetWeightKg == null ? null : Number(p.targetWeightKg),
      };
      return Promise.all(
        Array.from({ length: p.targetSets }, (_, i) => i + 1).map(
          async (position) => ({
            position,
            ...suggestNextSet(
              await getLastWorkingSet(p.exerciseId, position, beforeDay),
              plan,
            ),
          }),
        ),
      );
    }),
  );

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
    });
  }

  return {
    sessionId: session.id,
    day: dayOf(session.day),
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    templateId: session.templateId,
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
