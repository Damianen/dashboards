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
  type WarmupSetInput,
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
      warmups: { orderBy: { position: "asc" } },
    },
  },
} satisfies Prisma.WorkoutTemplateInclude;

type TemplateRow = Prisma.WorkoutTemplateGetPayload<{
  include: typeof templateInclude;
}>;

/** A pre-defined warmup set as the client receives it (Decimals coerced to numbers).
 *  Exactly one of weightKg (ABSOLUTE) / percentOfWorking (PERCENT) is set. */
export interface WarmupSetView {
  position: number;
  reps: number;
  weightMode: "ABSOLUTE" | "PERCENT";
  weightKg: number | null;
  percentOfWorking: number | null;
}

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
  weightIncrementKg: number | null;
  targetVolumeKg: number | null;
  restSec: number | null;
  notes: string | null;
  /** Ordered warmup definitions (empty for exercises with none). */
  warmups: WarmupSetView[];
}

export interface TemplateView {
  id: string;
  name: string;
  notes: string | null;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Civil day of the most recent session started from this template, or null if
   *  it's never been performed. Drives the "Last Performed" labels in the UI. */
  lastPerformedDay: string | null;
  exercises: TemplateExerciseView[];
}

/** Map loaded warmup rows → plain views, coercing Decimal weights to numbers. The
 *  rows arrive position-ordered (templateInclude orders them). */
export function serializeWarmups(
  warmups: {
    position: number;
    reps: number;
    weightMode: "ABSOLUTE" | "PERCENT";
    weightKg: Prisma.Decimal | null;
    percentOfWorking: Prisma.Decimal | null;
  }[],
): WarmupSetView[] {
  return warmups.map((w) => ({
    position: w.position,
    reps: w.reps,
    weightMode: w.weightMode,
    weightKg: w.weightKg == null ? null : Number(w.weightKg),
    percentOfWorking:
      w.percentOfWorking == null ? null : Number(w.percentOfWorking),
  }));
}

/** Map a Prisma row → plain view, coercing Decimal targets to numbers (the client
 *  must never see Decimal strings — same rule listSessions follows for weights). */
function serializeTemplate(
  t: TemplateRow,
  lastPerformedDay: string | null = null,
): TemplateView {
  return {
    id: t.id,
    name: t.name,
    notes: t.notes,
    archived: t.archived,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    lastPerformedDay,
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
      weightIncrementKg:
        e.weightIncrementKg == null ? null : Number(e.weightIncrementKg),
      targetVolumeKg: e.targetVolumeKg == null ? null : Number(e.targetVolumeKg),
      restSec: e.restSec,
      notes: e.notes,
      warmups: serializeWarmups(e.warmups),
    })),
  };
}

/** The target columns shared by TemplateExercise and SessionPlanItem, with the
 *  inactive mode's columns nulled out. */
export function targetColumns(e: TemplateExerciseInput) {
  if (e.targetType === "REPS") {
    return {
      targetType: "REPS" as const,
      targetSets: e.targetSets,
      repMin: e.repMin,
      repMax: e.repMax,
      targetWeightKg: e.targetWeightKg ?? null,
      weightIncrementKg: e.weightIncrementKg ?? null,
      targetVolumeKg: null,
    };
  }
  return {
    targetType: "VOLUME" as const,
    targetSets: null,
    repMin: null,
    repMax: null,
    targetWeightKg: null,
    weightIncrementKg: null,
    targetVolumeKg: e.targetVolumeKg,
  };
}

/** One warmup input → its DB columns, array index as position, the inactive mode's
 *  weight column nulled out. Shared shape between TemplateWarmupSet and the
 *  SessionPlanWarmup snapshot. */
export function warmupColumns(w: WarmupSetInput, position: number) {
  return {
    position,
    reps: w.reps,
    weightMode: w.weightMode,
    weightKg: w.weightMode === "ABSOLUTE" ? w.weightKg : null,
    percentOfWorking: w.weightMode === "PERCENT" ? w.percentOfWorking : null,
  };
}

/** Nested TemplateExercise create rows from the input list — array index is position.
 *  Each carries its ordered warmup definitions as a nested create. */
function exerciseCreateRows(
  exercises: TemplateExerciseInput[],
): Prisma.TemplateExerciseCreateWithoutTemplateInput[] {
  return exercises.map((e, position) => ({
    exercise: { connect: { id: e.exerciseId } },
    position,
    ...targetColumns(e),
    restSec: e.restSec ?? null,
    notes: e.notes ?? null,
    warmups: { create: e.warmups.map(warmupColumns) },
  }));
}

/** Translate a unique-name collision into a clean domain error. */
export function isUniqueNameError(err: unknown): boolean {
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

/** Civil day of the most recent session started from this template, or null. */
export async function getLastPerformed(
  templateId: string,
): Promise<string | null> {
  const session = await prisma.liftingSession.findFirst({
    where: { templateId },
    orderBy: { startedAt: "desc" },
    select: { day: true },
  });
  return session ? dayOf(session.day) : null;
}

export async function listTemplates({
  includeArchived = false,
}: { includeArchived?: boolean } = {}): Promise<TemplateView[]> {
  const templates = await prisma.workoutTemplate.findMany({
    where: includeArchived ? {} : { archived: false },
    orderBy: { name: "asc" },
    include: templateInclude,
  });
  // One grouped query for every template's latest session day (avoids N+1).
  const grouped = await prisma.liftingSession.groupBy({
    by: ["templateId"],
    where: { templateId: { in: templates.map((t) => t.id) } },
    _max: { day: true },
  });
  const lastDayByTemplate = new Map<string, string>();
  for (const g of grouped) {
    if (g.templateId && g._max.day) {
      lastDayByTemplate.set(g.templateId, dayOf(g._max.day));
    }
  }
  return templates.map((t) =>
    serializeTemplate(t, lastDayByTemplate.get(t.id) ?? null),
  );
}

/**
 * The pure selection core of resolveTemplateByName: pick a template by exact
 * case-insensitive name from an in-memory list (which must include archived
 * templates). Throws DomainError listing the available ACTIVE template names
 * when nothing matches, and a distinct DomainError for an archived match.
 */
export function selectTemplateByName<
  T extends { name: string; archived: boolean },
>(templates: T[], name: string): T {
  const match = templates.find(
    (t) => t.name.toLowerCase() === name.toLowerCase(),
  );
  if (!match) {
    const available = templates.filter((t) => !t.archived).map((t) => t.name);
    throw new DomainError(
      `no template named "${name}"; available: ${
        available.length ? available.join(", ") : "(none)"
      }`,
    );
  }
  if (match.archived) {
    throw new DomainError(`template "${match.name}" is archived`);
  }
  return match;
}

/**
 * Resolve a template by exact case-insensitive name for MCP — behavior identical
 * to the inline logic this replaced in the MCP start_workout_from_template tool.
 */
export async function resolveTemplateByName(
  name: string,
): Promise<TemplateView> {
  const templates = await listTemplates({ includeArchived: true });
  return selectTemplateByName(templates, name);
}

export async function getTemplate(id: string): Promise<TemplateView> {
  const template = await prisma.workoutTemplate.findUnique({
    where: { id },
    include: templateInclude,
  });
  if (!template) throw new NotFoundError("template", id);
  return serializeTemplate(template, await getLastPerformed(id));
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
          weightIncrementKg: e.weightIncrementKg,
          targetVolumeKg: e.targetVolumeKg,
          restSec: e.restSec,
          notes: e.notes,
          warmups: {
            create: e.warmups.map((w) => ({
              position: w.position,
              reps: w.reps,
              weightMode: w.weightMode,
              weightKg: w.weightKg,
              percentOfWorking: w.percentOfWorking,
            })),
          },
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
  weightIncrementKg: number | null;
  targetVolumeKg: number | null;
  restSec: number | null;
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
          weightIncrementKg: e.weightIncrementKg,
          targetVolumeKg: e.targetVolumeKg,
          restSec: e.restSec,
          // Snapshot the warmup definitions so template edits never rewrite this
          // session. Decimals copy straight across (Decimal → Decimal).
          warmups: {
            create: e.warmups.map((w) => ({
              position: w.position,
              reps: w.reps,
              weightMode: w.weightMode,
              weightKg: w.weightKg,
              percentOfWorking: w.percentOfWorking,
            })),
          },
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
      weightIncrementKg:
        p.weightIncrementKg == null ? null : Number(p.weightIncrementKg),
      targetVolumeKg: p.targetVolumeKg == null ? null : Number(p.targetVolumeKg),
      restSec: p.restSec,
    })),
  };
}
