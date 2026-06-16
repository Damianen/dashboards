import {
  EntryOrigin,
  type Exercise,
  type LiftingSet,
} from "@/generated/prisma/client";
import { dayOf, dayToDbDate } from "@/lib/dates";
import { shouldReuseSession } from "@/lib/rules";
import { logSetSchema, type LogSetInput } from "@/lib/schemas/lifting";
import { prisma } from "@/server/db";
import { NotFoundError } from "./errors";

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

export function listExercises(): Promise<Exercise[]> {
  return prisma.exercise.findMany({ orderBy: { name: "asc" } });
}
