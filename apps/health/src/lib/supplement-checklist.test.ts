import { describe, expect, it } from "vitest";

import {
  buildChecklist,
  type ChecklistLog,
  type ChecklistSupplement,
  SUPPLEMENT_TIME_GROUPS,
} from "@/lib/supplement-checklist";

function supp(
  over: Partial<ChecklistSupplement> & Pick<ChecklistSupplement, "id">,
): ChecklistSupplement {
  return {
    name: over.id,
    dose: 1,
    unit: "g",
    timeGroup: "MORNING",
    position: 0,
    ...over,
  };
}

describe("buildChecklist", () => {
  it("always returns the three groups in fixed order, even when empty", () => {
    const groups = buildChecklist([], []);
    expect(groups.map((g) => g.timeGroup)).toEqual([
      "MORNING",
      "EVENING",
      "PRE_WORKOUT",
    ]);
    expect(groups.every((g) => g.items.length === 0 && g.total === 0)).toBe(
      true,
    );
    expect(SUPPLEMENT_TIME_GROUPS).toEqual(["MORNING", "EVENING", "PRE_WORKOUT"]);
  });

  it("orders items within a group by position", () => {
    const supps = [
      supp({ id: "c", position: 2 }),
      supp({ id: "a", position: 0 }),
      supp({ id: "b", position: 1 }),
    ];
    const morning = buildChecklist(supps, []).find(
      (g) => g.timeGroup === "MORNING",
    )!;
    expect(morning.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("marks an item complete iff a log exists, and counts done/total", () => {
    const supps = [
      supp({ id: "a", position: 0 }),
      supp({ id: "b", position: 1 }),
      supp({ id: "c", position: 2 }),
    ];
    const logs: ChecklistLog[] = [
      { supplementId: "a", doseSnapshot: 1, unitSnapshot: "g" },
      { supplementId: "c", doseSnapshot: 1, unitSnapshot: "g" },
    ];
    const morning = buildChecklist(supps, logs).find(
      (g) => g.timeGroup === "MORNING",
    )!;
    expect(morning.items.map((i) => i.complete)).toEqual([true, false, true]);
    expect(morning.doneCount).toBe(2);
    expect(morning.total).toBe(3);
  });

  it("shows the log snapshot for checked items and the current dose for unchecked", () => {
    const supps = [
      supp({ id: "checked", dose: 10, unit: "mg", position: 0 }),
      supp({ id: "unchecked", dose: 5, unit: "g", position: 1 }),
    ];
    // The supplement's dose was 4mg/"mcg" when checked; it's since been edited to 10mg.
    const logs: ChecklistLog[] = [
      { supplementId: "checked", doseSnapshot: 4, unitSnapshot: "mcg" },
    ];
    const items = buildChecklist(supps, logs)[0]?.items ?? [];
    expect(items[0]).toMatchObject({ dose: 4, unit: "mcg", complete: true });
    expect(items[1]).toMatchObject({ dose: 5, unit: "g", complete: false });
  });

  it("places supplements into their own time-group only", () => {
    const supps = [
      supp({ id: "m", timeGroup: "MORNING" }),
      supp({ id: "e", timeGroup: "EVENING" }),
      supp({ id: "p", timeGroup: "PRE_WORKOUT" }),
    ];
    const groups = buildChecklist(supps, []);
    expect(groups.find((g) => g.timeGroup === "MORNING")?.items[0]?.id).toBe(
      "m",
    );
    expect(groups.find((g) => g.timeGroup === "EVENING")?.items[0]?.id).toBe(
      "e",
    );
    expect(
      groups.find((g) => g.timeGroup === "PRE_WORKOUT")?.items[0]?.id,
    ).toBe("p");
  });
});
