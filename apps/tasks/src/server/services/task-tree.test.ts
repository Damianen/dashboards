import { describe, expect, it } from "vitest";

import {
  buildTaskTree,
  collectDescendantIds,
  wouldCreateCycle,
  type SectionedTreeTask,
  type TreeTask,
} from "./task-tree";

function t(id: string, parentId: string | null = null): TreeTask {
  return { id, parentId };
}

describe("wouldCreateCycle", () => {
  it("detects self-parenting", () => {
    expect(wouldCreateCycle("a", "a", [t("a")])).toBe(true);
  });

  it("detects a direct child as new parent", () => {
    const tasks = [t("a"), t("b", "a")];
    expect(wouldCreateCycle("a", "b", tasks)).toBe(true);
  });

  it("detects a deep descendant as new parent", () => {
    const tasks = [t("a"), t("b", "a"), t("c", "b"), t("d", "c")];
    expect(wouldCreateCycle("a", "d", tasks)).toBe(true);
  });

  it("allows moving under an unrelated task", () => {
    const tasks = [t("a"), t("b", "a"), t("x"), t("y", "x")];
    expect(wouldCreateCycle("a", "y", tasks)).toBe(false);
  });

  it("allows moving a leaf under its grandparent", () => {
    const tasks = [t("a"), t("b", "a"), t("c", "b")];
    expect(wouldCreateCycle("c", "a", tasks)).toBe(false);
  });

  it("terminates on pre-existing corrupt cycles", () => {
    const tasks = [t("p", "q"), t("q", "p"), t("z")];
    expect(wouldCreateCycle("z", "p", tasks)).toBe(false);
  });
});

describe("collectDescendantIds", () => {
  it("collects a three-level tree breadth-first, excluding the root", () => {
    const tasks = [
      t("a"),
      t("b", "a"),
      t("c", "a"),
      t("d", "b"),
      t("e", "d"),
      t("other"),
    ];
    expect(collectDescendantIds("a", tasks)).toEqual(["b", "c", "d", "e"]);
  });

  it("returns empty for a leaf", () => {
    expect(collectDescendantIds("a", [t("a"), t("b")])).toEqual([]);
  });
});

function st(
  id: string,
  parentId: string | null,
  sectionId: string | null,
  order: string,
): SectionedTreeTask {
  return { id, parentId, sectionId, order };
}

describe("buildTaskTree", () => {
  it("nests subtasks and sorts every sibling list by order", () => {
    const tree = buildTaskTree([
      st("root2", null, null, "a2"),
      st("root1", null, null, "a1"),
      st("childB", "root1", null, "a5"),
      st("childA", "root1", null, "a4"),
      st("grand", "childA", null, "a9"),
    ]);
    const roots = tree.get(null)!;
    expect(roots.map((n) => n.task.id)).toEqual(["root1", "root2"]);
    expect(roots[0].subtasks.map((n) => n.task.id)).toEqual([
      "childA",
      "childB",
    ]);
    expect(roots[0].subtasks[0].subtasks.map((n) => n.task.id)).toEqual([
      "grand",
    ]);
  });

  it("groups roots by sectionId", () => {
    const tree = buildTaskTree([
      st("inRoot", null, null, "a1"),
      st("inS1", null, "s1", "a1"),
      st("sub", "inS1", null, "a1"),
    ]);
    expect(tree.get(null)!.map((n) => n.task.id)).toEqual(["inRoot"]);
    expect(tree.get("s1")!.map((n) => n.task.id)).toEqual(["inS1"]);
    expect(tree.get("s1")![0].subtasks.map((n) => n.task.id)).toEqual(["sub"]);
  });

  it("treats tasks with absent parents as roots", () => {
    const tree = buildTaskTree([st("orphan", "filtered-out", "s1", "a1")]);
    expect(tree.get("s1")!.map((n) => n.task.id)).toEqual(["orphan"]);
  });
});
