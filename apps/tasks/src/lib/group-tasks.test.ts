import { describe, expect, it } from "vitest";

import { groupByDueDay } from "./group-tasks";

const AMS = "Europe/Amsterdam";

interface T {
  id: string;
  dueAt: Date | null;
}

const t = (id: string, iso: string | null): T => ({
  id,
  dueAt: iso === null ? null : new Date(iso),
});

describe("groupByDueDay", () => {
  it("buckets by local calendar day and preserves input order", () => {
    const groups = groupByDueDay(
      [
        t("a", "2026-06-12T22:00:00Z"), // local 2026-06-13 00:00
        t("b", "2026-06-13T08:00:00Z"), // local 2026-06-13 10:00
        t("c", "2026-06-13T22:00:00Z"), // local 2026-06-14 00:00
      ],
      AMS,
    );
    expect(groups.map((g) => g.dayKey)).toEqual(["2026-06-13", "2026-06-14"]);
    expect(groups[0].tasks.map((x) => x.id)).toEqual(["a", "b"]);
    expect(groups[1].tasks.map((x) => x.id)).toEqual(["c"]);
  });

  it("exposes the local midnight instant of each group", () => {
    const [group] = groupByDueDay([t("a", "2026-06-13T08:00:00Z")], AMS);
    expect(group.dayStart.toISOString()).toBe("2026-06-12T22:00:00.000Z");
  });

  it("skips tasks without a due date", () => {
    const groups = groupByDueDay(
      [t("a", null), t("b", "2026-06-13T08:00:00Z")],
      AMS,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].tasks.map((x) => x.id)).toEqual(["b"]);
  });

  it("returns no groups for an empty list", () => {
    expect(groupByDueDay([], AMS)).toEqual([]);
  });
});
