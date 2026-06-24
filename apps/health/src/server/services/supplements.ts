import { type EntryOrigin, Prisma, type Supplement } from "@/generated/prisma/client";
import { dayToDbDate, todayLocal } from "@/lib/dates";
import {
  type CheckInput,
  checkSchema,
  type CreateSupplementInput,
  createSupplementSchema,
  type GroupCheckInput,
  groupCheckSchema,
  type ReorderSupplementsInput,
  reorderSupplementsSchema,
  type UpdateSupplementInput,
  updateSupplementSchema,
} from "@/lib/schemas/supplement";
import {
  buildChecklist,
  type ChecklistGroup,
} from "@/lib/supplement-checklist";
import { prisma } from "@/server/db";
import { NotFoundError } from "./errors";

/** A managed supplement as the client sees it — Decimal dose coerced to a number. */
export interface SupplementView {
  id: string;
  name: string;
  dose: number;
  unit: string;
  caffeineMg: number | null;
  timeGroup: Supplement["timeGroup"];
  position: number;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function serialize(s: Supplement): SupplementView {
  return {
    id: s.id,
    name: s.name,
    dose: Number(s.dose),
    unit: s.unit,
    caffeineMg: s.caffeineMg == null ? null : Number(s.caffeineMg),
    timeGroup: s.timeGroup,
    position: s.position,
    archived: s.archived,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

// ----- LIST MANAGEMENT -----

/** All supplements ordered by group then position (active-only unless asked). */
export async function list(includeArchived = false): Promise<SupplementView[]> {
  const rows = await prisma.supplement.findMany({
    where: includeArchived ? {} : { archived: false },
    orderBy: [{ timeGroup: "asc" }, { position: "asc" }],
  });
  return rows.map(serialize);
}

export async function create(
  input: CreateSupplementInput,
): Promise<SupplementView> {
  const data = createSupplementSchema.parse(input);
  // New items append to the end of their group (archived items keep their slots).
  const position = await prisma.supplement.count({
    where: { timeGroup: data.timeGroup },
  });
  const created = await prisma.supplement.create({
    data: {
      name: data.name,
      dose: data.dose,
      unit: data.unit,
      caffeineMg: data.caffeineMg ?? null,
      timeGroup: data.timeGroup,
      position,
    },
  });
  return serialize(created);
}

export async function update(
  id: string,
  input: UpdateSupplementInput,
): Promise<SupplementView> {
  const data = updateSupplementSchema.parse(input);
  const existing = await prisma.supplement.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("supplement", id);

  const patch: Prisma.SupplementUpdateInput = {
    name: data.name,
    dose: data.dose,
    unit: data.unit,
    caffeineMg: data.caffeineMg ?? null,
    timeGroup: data.timeGroup,
  };
  // Moving to a different group → append to the end of the new group.
  if (data.timeGroup !== existing.timeGroup) {
    patch.position = await prisma.supplement.count({
      where: { timeGroup: data.timeGroup },
    });
  }
  const updated = await prisma.supplement.update({ where: { id }, data: patch });
  return serialize(updated);
}

export async function setArchived(
  id: string,
  archived: boolean,
): Promise<SupplementView> {
  try {
    // Archiving never deletes — past SupplementLog rows keep their snapshots.
    const updated = await prisma.supplement.update({
      where: { id },
      data: { archived },
    });
    return serialize(updated);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      throw new NotFoundError("supplement", id);
    }
    throw err;
  }
}

/** Persist a new top-to-bottom order for one group; `ids` is that order. Updates
 *  scope by (id, timeGroup) so an id outside the group is a harmless no-op. */
export async function reorder(
  input: ReorderSupplementsInput,
): Promise<SupplementView[]> {
  const { timeGroup, ids } = reorderSupplementsSchema.parse(input);
  await prisma.$transaction(
    ids.map((id, position) =>
      prisma.supplement.updateMany({
        where: { id, timeGroup },
        data: { position },
      }),
    ),
  );
  return list(true);
}

// ----- CHECKLIST -----

/** The day's checklist: active supplements grouped + each annotated complete. */
export async function getChecklist(
  day: string = todayLocal(),
): Promise<ChecklistGroup[]> {
  const dbDay = dayToDbDate(day);
  const [supplements, logs] = await Promise.all([
    prisma.supplement.findMany({
      where: { archived: false },
      orderBy: [{ timeGroup: "asc" }, { position: "asc" }],
    }),
    prisma.supplementLog.findMany({
      where: { day: dbDay, supplement: { archived: false } },
      select: { supplementId: true, doseSnapshot: true, unitSnapshot: true },
    }),
  ]);
  return buildChecklist(
    supplements.map((s) => ({
      id: s.id,
      name: s.name,
      dose: Number(s.dose),
      unit: s.unit,
      timeGroup: s.timeGroup,
      position: s.position,
    })),
    logs.map((l) => ({
      supplementId: l.supplementId,
      doseSnapshot: Number(l.doseSnapshot),
      unitSnapshot: l.unitSnapshot,
    })),
  );
}

/** Tick a supplement for a day. Idempotent: re-checking keeps the original row
 *  (and its snapshot). Returns the day's refreshed checklist. */
export async function check(
  input: CheckInput,
  origin: EntryOrigin,
): Promise<ChecklistGroup[]> {
  const { supplementId, day } = checkSchema.parse(input);
  const dayStr = day ?? todayLocal();
  const dbDay = dayToDbDate(dayStr);

  const supp = await prisma.supplement.findUnique({
    where: { id: supplementId },
  });
  if (!supp) throw new NotFoundError("supplement", supplementId);

  await prisma.supplementLog.upsert({
    where: { supplementId_day: { supplementId, day: dbDay } },
    create: {
      supplementId,
      day: dbDay,
      takenAt: new Date(),
      doseSnapshot: supp.dose,
      unitSnapshot: supp.unit,
      // Snapshot caffeine at check time so editing the supplement later never
      // rewrites past days. Raises the day's caffeine total + water target.
      caffeineSnapshot: supp.caffeineMg,
      origin,
    },
    update: {},
  });
  return getChecklist(dayStr);
}

/** Untick a supplement for a day. Idempotent (no error if it wasn't checked). */
export async function uncheck(input: CheckInput): Promise<ChecklistGroup[]> {
  const { supplementId, day } = checkSchema.parse(input);
  const dayStr = day ?? todayLocal();
  await prisma.supplementLog.deleteMany({
    where: { supplementId, day: dayToDbDate(dayStr) },
  });
  return getChecklist(dayStr);
}

/** Check every not-yet-checked active item in a group. Idempotent — returns how
 *  many were newly checked plus the day's refreshed checklist. */
export async function checkGroup(
  input: GroupCheckInput,
  origin: EntryOrigin,
): Promise<{ newlyChecked: number; checklist: ChecklistGroup[] }> {
  const { timeGroup, day } = groupCheckSchema.parse(input);
  const dayStr = day ?? todayLocal();
  const dbDay = dayToDbDate(dayStr);

  const active = await prisma.supplement.findMany({
    where: { archived: false, timeGroup },
    select: { id: true, dose: true, unit: true, caffeineMg: true },
  });
  const have = new Set(
    (
      await prisma.supplementLog.findMany({
        where: { day: dbDay, supplementId: { in: active.map((a) => a.id) } },
        select: { supplementId: true },
      })
    ).map((r) => r.supplementId),
  );
  const toCreate = active.filter((a) => !have.has(a.id));
  if (toCreate.length > 0) {
    const now = new Date();
    await prisma.supplementLog.createMany({
      data: toCreate.map((a) => ({
        supplementId: a.id,
        day: dbDay,
        takenAt: now,
        doseSnapshot: a.dose,
        unitSnapshot: a.unit,
        caffeineSnapshot: a.caffeineMg,
        origin,
      })),
      skipDuplicates: true,
    });
  }
  return { newlyChecked: toCreate.length, checklist: await getChecklist(dayStr) };
}

/** Uncheck every active item in a group. Returns how many were removed. */
export async function uncheckGroup(
  input: GroupCheckInput,
): Promise<{ unchecked: number; checklist: ChecklistGroup[] }> {
  const { timeGroup, day } = groupCheckSchema.parse(input);
  const dayStr = day ?? todayLocal();
  const { count } = await prisma.supplementLog.deleteMany({
    where: { day: dayToDbDate(dayStr), supplement: { timeGroup, archived: false } },
  });
  return { unchecked: count, checklist: await getChecklist(dayStr) };
}

/** Active supplements whose name matches case-insensitively — for MCP name lookup. */
export async function resolveByName(name: string): Promise<SupplementView[]> {
  const rows = await prisma.supplement.findMany({
    where: { archived: false, name: { equals: name.trim(), mode: "insensitive" } },
    orderBy: [{ timeGroup: "asc" }, { position: "asc" }],
  });
  return rows.map(serialize);
}
