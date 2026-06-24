import type { SupplementTimeGroup } from "@/lib/schemas/supplement";

/** Fixed group order — also the order the checklist renders top to bottom. */
export const SUPPLEMENT_TIME_GROUPS: readonly SupplementTimeGroup[] = [
  "MORNING",
  "EVENING",
  "PRE_WORKOUT",
] as const;

/** A managed supplement (active), as the checklist needs it. */
export interface ChecklistSupplement {
  id: string;
  name: string;
  dose: number;
  unit: string;
  timeGroup: SupplementTimeGroup;
  position: number;
}

/** A day's log row for a supplement — carries the dose/unit snapshotted at check. */
export interface ChecklistLog {
  supplementId: string;
  doseSnapshot: number;
  unitSnapshot: string;
}

export interface ChecklistItem {
  id: string;
  name: string;
  dose: number;
  unit: string;
  complete: boolean;
}

export interface ChecklistGroup {
  timeGroup: SupplementTimeGroup;
  items: ChecklistItem[];
  doneCount: number;
  total: number;
}

/**
 * Build the per-day checklist: the three groups in fixed order (each always
 * present, even when empty), items sorted by position, annotated `complete` when
 * a log exists for the day. A checked item shows its LOG snapshot (what was
 * recorded); an unchecked item shows the supplement's current dose/unit — so
 * editing a dose later never rewrites an already-checked day's shown value.
 */
export function buildChecklist(
  supplements: ChecklistSupplement[],
  logs: ChecklistLog[],
): ChecklistGroup[] {
  const logById = new Map(logs.map((l) => [l.supplementId, l]));

  return SUPPLEMENT_TIME_GROUPS.map((timeGroup) => {
    const items: ChecklistItem[] = supplements
      .filter((s) => s.timeGroup === timeGroup)
      .sort((a, b) => a.position - b.position)
      .map((s) => {
        const log = logById.get(s.id);
        return {
          id: s.id,
          name: s.name,
          dose: log ? log.doseSnapshot : s.dose,
          unit: log ? log.unitSnapshot : s.unit,
          complete: log != null,
        };
      });

    return {
      timeGroup,
      items,
      doneCount: items.filter((i) => i.complete).length,
      total: items.length,
    };
  });
}
