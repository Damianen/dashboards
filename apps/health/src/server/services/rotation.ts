// The workout rotation: an ordered list of template/REST slots persisted as a
// single settings row (additive — no migration), plus the "which session is
// next" read. The advance policy itself is pure (nextRotationEntry in
// src/lib/briefing.ts); this service only feeds it the rotation and the most
// recent logged rotation session.

import { nextRotationEntry } from "@/lib/briefing";
import { civilDay, daysBetween, dayToDbDate, todayLocal } from "@/lib/dates";
import {
  rotationSchema,
  type RotationEntry,
  type RotationInput,
} from "@/lib/schemas/briefing";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/services/errors";

const ROTATION_KEY = "workout.rotation";

/** A rotation slot enriched with the template's display state. */
export interface RotationEntryView {
  kind: "TEMPLATE" | "REST";
  templateId: string | null;
  /** null for REST slots — and for a template that no longer exists. */
  templateName: string | null;
  archived: boolean;
}

export interface RotationView {
  entries: RotationEntryView[];
}

/** The raw stored rotation; a missing or malformed row reads as "not configured". */
export async function getRotationEntries(): Promise<RotationEntry[]> {
  const setting = await prisma.setting.findUnique({
    where: { key: ROTATION_KEY },
  });
  if (!setting) return [];
  const parsed = rotationSchema.safeParse({ entries: setting.value });
  return parsed.success ? parsed.data.entries : [];
}

async function templatesById(
  ids: string[],
): Promise<Map<string, { name: string; archived: boolean }>> {
  if (ids.length === 0) return new Map();
  const templates = await prisma.workoutTemplate.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, archived: true },
  });
  return new Map(
    templates.map((t) => [t.id, { name: t.name, archived: t.archived }]),
  );
}

/** The stored rotation enriched with template names + archived flags for the UI. */
export async function getRotation(): Promise<RotationView> {
  const entries = await getRotationEntries();
  const byId = await templatesById(
    entries.flatMap((e) => (e.kind === "TEMPLATE" ? [e.templateId] : [])),
  );
  return {
    entries: entries.map((e): RotationEntryView => {
      if (e.kind === "REST") {
        return { kind: "REST", templateId: null, templateName: null, archived: false };
      }
      const t = byId.get(e.templateId);
      return {
        kind: "TEMPLATE",
        templateId: e.templateId,
        templateName: t?.name ?? null,
        archived: t?.archived ?? false,
      };
    }),
  };
}

/**
 * Replace the rotation (full list PATCH — order is the payload's order).
 * Rejects ids that don't reference an existing template; archived templates
 * are allowed (they're flagged in the view, and starting one is refused by the
 * normal start-from-template flow anyway).
 */
export async function setRotation(input: RotationInput): Promise<RotationView> {
  const { entries } = rotationSchema.parse(input);
  const ids = [
    ...new Set(entries.flatMap((e) => (e.kind === "TEMPLATE" ? [e.templateId] : []))),
  ];
  const byId = await templatesById(ids);
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new DomainError(`unknown template id(s): ${missing.join(", ")}`);
  }
  await prisma.setting.upsert({
    where: { key: ROTATION_KEY },
    create: { key: ROTATION_KEY, value: entries },
    update: { value: entries },
  });
  return getRotation();
}

/** The next rotation slot for `forDay`, enriched for display. */
export interface NextSessionResult {
  entry: RotationEntry;
  index: number;
  templateName: string | null;
  templateArchived: boolean;
}

/**
 * Which rotation slot is up on `forDay`: the entry after the most recent
 * logged session (on or before that day) whose template is in the rotation,
 * with REST slots consumed by elapsed days — see nextRotationEntry. Returns
 * null when no rotation is configured (the briefing shows a setup hint).
 */
export async function getNextSession(
  forDay: string = todayLocal(),
): Promise<NextSessionResult | null> {
  const rotation = await getRotationEntries();
  const templateIds = rotation.flatMap((e) =>
    e.kind === "TEMPLATE" ? [e.templateId] : [],
  );

  let lastTemplateId: string | null = null;
  let daysSince: number | null = null;
  if (templateIds.length > 0) {
    const last = await prisma.liftingSession.findFirst({
      where: { templateId: { in: templateIds }, day: { lte: dayToDbDate(forDay) } },
      orderBy: [{ day: "desc" }, { startedAt: "desc" }],
      select: { templateId: true, day: true },
    });
    if (last?.templateId != null) {
      lastTemplateId = last.templateId;
      daysSince = daysBetween(civilDay(last.day), forDay);
    }
  }

  const next = nextRotationEntry(rotation, lastTemplateId, daysSince);
  if (next === null) return null;
  if (next.entry.kind === "REST") {
    return { ...next, templateName: null, templateArchived: false };
  }
  const byId = await templatesById([next.entry.templateId]);
  const template = byId.get(next.entry.templateId);
  return {
    ...next,
    templateName: template?.name ?? null,
    templateArchived: template?.archived ?? false,
  };
}
