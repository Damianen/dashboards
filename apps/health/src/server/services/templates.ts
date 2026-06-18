import { Prisma } from "@/generated/prisma/client";
import { dayOf, dayToDbDate } from "@/lib/dates";
import { validateTemplateTarget } from "@/lib/rules";
import {
  type CreateTemplateInput,
  createTemplateSchema,
  type StartFromTemplateInput,
  startFromTemplateSchema,
  type TemplateExerciseInput,
  type UpdateTemplateInput,
  updateTemplateSchema,
} from "@/lib/schemas/template";
import { prisma } from "@/server/db";
import { DomainError, NotFoundError } from "./errors";

// One include shape reused by every read so the serialized result is uniform:
// exercises in position order, each with its exercise's name + muscle group.
const templateInclude = {
  exercises: {
    orderBy: { position: "asc" },
    include: {
      exercise: { select: { id: true, name: true, muscleGroup: true } },
    },
  },
} satisfies Prisma.WorkoutTemplateInclude;

type TemplateRow = Prisma.WorkoutTemplateGetPayload<{
  include: typeof templateInclude;
}>;

export interface TemplateExerciseView {
  id: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string | null;
  position: number;
  targetType: "REPS" | "VOLUME";
  targetSets: number | null;
  repMin: number | null;
  repMax: number | null;
  targetWeightKg: number | null;
  targetVolumeKg: number | null;
  restSec: number | null;
  notes: string | null;
}

export interface TemplateView {
  id: string;
  name: string;
  notes: string | null;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  exercises: TemplateExerciseView[];
}

/** Map a Prisma row → plain view, coercing Decimal targets to numbers (the client
 *  must never see Decimal strings — same rule listSessions follows for weights). */
function serializeTemplate(t: TemplateRow): TemplateView {
  return {
    id: t.id,
    name: t.name,
    notes: t.notes,
    archived: t.archived,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    exercises: t.exercises.map((e) => ({
      id: e.id,
      exerciseId: e.exerciseId,
      exerciseName: e.exercise.name,
      muscleGroup: e.exercise.muscleGroup,
      position: e.position,
      targetType: e.targetType,
      targetSets: e.targetSets,
      repMin: e.repMin,
      repMax: e.repMax,
      targetWeightKg: e.targetWeightKg == null ? null : Number(e.targetWeightKg),
      targetVolumeKg: e.targetVolumeKg == null ? null : Number(e.targetVolumeKg),
      restSec: e.restSec,
      notes: e.notes,
    })),
  };
}

/** The six target columns shared by TemplateExercise and SessionPlanItem, with the
 *  inactive mode's columns nulled out. */
function targetColumns(e: TemplateExerciseInput) {
  if (e.targetType === "REPS") {
    return {
      targetType: "REPS" as const,
      targetSets: e.targetSets,
      repMin: e.repMin,
      repMax: e.repMax,
      targetWeightKg: e.targetWeightKg ?? null,
      targetVolumeKg: null,
    };
  }
  return {
    targetType: "VOLUME" as const,
    targetSets: null,
    repMin: null,
    repMax: null,
    targetWeightKg: null,
    targetVolumeKg: e.targetVolumeKg,
  };
}

/** Nested TemplateExercise create rows from the input list — array index is position. */
function exerciseCreateRows(
  exercises: TemplateExerciseInput[],
): Prisma.TemplateExerciseCreateWithoutTemplateInput[] {
  return exercises.map((e, position) => ({
    exercise: { connect: { id: e.exerciseId } },
    position,
    ...targetColumns(e),
    restSec: e.restSec ?? null,
    notes: e.notes ?? null,
  }));
}

/** Translate a unique-name collision into a clean domain error. */
function isUniqueNameError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

export async function createTemplate(
  input: CreateTemplateInput,
): Promise<TemplateView> {
  const data = createTemplateSchema.parse(input);
  data.exercises.forEach(validateTemplateTarget);
  try {
    const created = await prisma.workoutTemplate.create({
      data: {
        name: data.name,
        notes: data.notes ?? null,
        exercises: { create: exerciseCreateRows(data.exercises) },
      },
      include: templateInclude,
    });
    return serializeTemplate(created);
  } catch (err) {
    if (isUniqueNameError(err)) {
      throw new DomainError(`a template named "${data.name}" already exists`);
    }
    throw err;
  }
}

export async function updateTemplate(
  id: string,
  input: UpdateTemplateInput,
): Promise<TemplateView> {
  const data = updateTemplateSchema.parse(input);
  data.exercises.forEach(validateTemplateTarget);

  const existing = await prisma.workoutTemplate.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("template", id);

  try {
    // Replace metadata, then drop and recreate the exercise rows — the simplest
    // correct way to handle reorder / add / remove in one shot.
    const updated = await prisma.$transaction(async (tx) => {
      await tx.templateExercise.deleteMany({ where: { templateId: id } });
      return tx.workoutTemplate.update({
        where: { id },
        data: {
          name: data.name,
          notes: data.notes ?? null,
          exercises: { create: exerciseCreateRows(data.exercises) },
        },
        include: templateInclude,
      });
    });
    return serializeTemplate(updated);
  } catch (err) {
    if (isUniqueNameError(err)) {
      throw new DomainError(`a template named "${data.name}" already exists`);
    }
    throw err;
  }
}

export async function listTemplates({
  includeArchived = false,
}: { includeArchived?: boolean } = {}): Promise<TemplateView[]> {
  const templates = await prisma.workoutTemplate.findMany({
    where: includeArchived ? {} : { archived: false },
    orderBy: { name: "asc" },
    include: templateInclude,
  });
  return templates.map(serializeTemplate);
}

export async function getTemplate(id: string): Promise<TemplateView> {
  const template = await prisma.workoutTemplate.findUnique({
    where: { id },
    include: templateInclude,
  });
  if (!template) throw new NotFoundError("template", id);
  return serializeTemplate(template);
}

export async function duplicateTemplate(id: string): Promise<TemplateView> {
  const source = await prisma.workoutTemplate.findUnique({
    where: { id },
    include: templateInclude,
  });
  if (!source) throw new NotFoundError("template", id);

  // Find a free "<name> (copy)" / "(copy 2)" / … name.
  const taken = new Set(
    (
      await prisma.workoutTemplate.findMany({
        where: { name: { startsWith: `${source.name} (copy` } },
        select: { name: true },
      })
    ).map((t) => t.name),
  );
  let name = `${source.name} (copy)`;
  for (let n = 2; taken.has(name); n++) name = `${source.name} (copy ${n})`;

  const copy = await prisma.workoutTemplate.create({
    data: {
      name,
      notes: source.notes,
      exercises: {
        create: source.exercises.map((e) => ({
          exercise: { connect: { id: e.exerciseId } },
          position: e.position,
          targetType: e.targetType,
          targetSets: e.targetSets,
          repMin: e.repMin,
          repMax: e.repMax,
          targetWeightKg: e.targetWeightKg,
          targetVolumeKg: e.targetVolumeKg,
          restSec: e.restSec,
          notes: e.notes,
        })),
      },
    },
    include: templateInclude,
  });
  return serializeTemplate(copy);
}

export async function setArchived(
  id: string,
  archived: boolean,
): Promise<TemplateView> {
  try {
    // Toggling archived never deletes anything and never touches past sessions —
    // they carry their own SessionPlanItem snapshot.
    const updated = await prisma.workoutTemplate.update({
      where: { id },
      data: { archived },
      include: templateInclude,
    });
    return serializeTemplate(updated);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      throw new NotFoundError("template", id);
    }
    throw err;
  }
}

export interface SessionPlanItemView {
  id: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string | null;
  position: number;
  targetType: "REPS" | "VOLUME";
  targetSets: number | null;
  repMin: number | null;
  repMax: number | null;
  targetWeightKg: number | null;
  targetVolumeKg: number | null;
}

export interface StartedSessionView {
  sessionId: string;
  day: string;
  startedAt: Date;
  templateId: string | null;
  planItems: SessionPlanItemView[];
}

/**
 * Snapshot a template into a new session: create a LiftingSession (day bucketed
 * from startedAt) and copy each TemplateExercise into a SessionPlanItem in ONE
 * transaction. The snapshot is the point — the session never re-reads the template,
 * so later edits/archival of the template don't rewrite history. Refuses archived
 * templates.
 */
export async function startSessionFromTemplate(
  input: StartFromTemplateInput,
): Promise<StartedSessionView> {
  const data = startFromTemplateSchema.parse(input);
  const template = await prisma.workoutTemplate.findUnique({
    where: { id: data.templateId },
    include: templateInclude,
  });
  if (!template) throw new NotFoundError("template", data.templateId);
  if (template.archived) {
    throw new DomainError("cannot start from an archived template");
  }

  const startedAt = data.startedAt ? new Date(data.startedAt) : new Date();
  const session = await prisma.liftingSession.create({
    data: {
      day: dayToDbDate(dayOf(startedAt)),
      startedAt,
      templateId: template.id,
      planItems: {
        create: template.exercises.map((e) => ({
          exercise: { connect: { id: e.exerciseId } },
          position: e.position,
          targetType: e.targetType,
          targetSets: e.targetSets,
          repMin: e.repMin,
          repMax: e.repMax,
          targetWeightKg: e.targetWeightKg,
          targetVolumeKg: e.targetVolumeKg,
        })),
      },
    },
    include: {
      planItems: {
        orderBy: { position: "asc" },
        include: {
          exercise: { select: { id: true, name: true, muscleGroup: true } },
        },
      },
    },
  });

  return {
    sessionId: session.id,
    day: dayOf(session.day),
    startedAt: session.startedAt,
    templateId: session.templateId,
    planItems: session.planItems.map((p) => ({
      id: p.id,
      exerciseId: p.exerciseId,
      exerciseName: p.exercise.name,
      muscleGroup: p.exercise.muscleGroup,
      position: p.position,
      targetType: p.targetType,
      targetSets: p.targetSets,
      repMin: p.repMin,
      repMax: p.repMax,
      targetWeightKg: p.targetWeightKg == null ? null : Number(p.targetWeightKg),
      targetVolumeKg: p.targetVolumeKg == null ? null : Number(p.targetVolumeKg),
    })),
  };
}
