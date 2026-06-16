import { describe, expect, it } from "vitest";

import {
  applyOpToFlatList,
  applyOpToLabelView,
  applyOpToProjectView,
  applyOpToTodayView,
  collectSubtreeIds,
  type TaskCacheOp,
  type TreeNode,
} from "./task-cache";

interface T {
  id: string;
  completedAt: Date | null;
  title: string;
  priority: number;
}

const COMPLETED_AT = new Date("2026-06-16T10:00:00Z");

const t = (id: string, over: Partial<T> = {}): T => ({
  id,
  completedAt: null,
  title: id,
  priority: 4,
  ...over,
});

const node = (task: T, subtasks: TreeNode<T>[] = []): TreeNode<T> => ({
  task,
  subtasks,
});

describe("applyOpToFlatList", () => {
  it("removes completed ids", () => {
    const list = [t("a"), t("b"), t("c")];
    const op: TaskCacheOp<T> = {
      kind: "complete",
      ids: ["a", "c"],
      completedAt: COMPLETED_AT,
    };
    expect(applyOpToFlatList(list, op).map((x) => x.id)).toEqual(["b"]);
  });

  it("removes deleted ids", () => {
    const list = [t("a"), t("b")];
    const op: TaskCacheOp<T> = { kind: "remove", ids: ["b"] };
    expect(applyOpToFlatList(list, op).map((x) => x.id)).toEqual(["a"]);
  });

  it("patches the matching task only, immutably", () => {
    const list = [t("a", { title: "old" }), t("b")];
    const op: TaskCacheOp<T> = {
      kind: "patch",
      id: "a",
      patch: { title: "new", priority: 1 },
    };
    const next = applyOpToFlatList(list, op);
    expect(next[0]).toMatchObject({ id: "a", title: "new", priority: 1 });
    expect(next[1]).toBe(list[1]); // untouched task keeps identity
    expect(list[0].title).toBe("old"); // original not mutated
  });

  it("keeps relocated tasks in the list and patches their container", () => {
    const list = [t("a", { title: "x" }), t("b")];
    const op: TaskCacheOp<T> = {
      kind: "relocate",
      ids: ["a"],
      patch: { title: "moved" },
    };
    const next = applyOpToFlatList(list, op);
    expect(next.map((x) => x.id)).toEqual(["a", "b"]);
    expect(next[0].title).toBe("moved");
  });
});

describe("applyOpToTodayView", () => {
  it("applies to both the overdue and today buckets", () => {
    const view = {
      overdue: [t("a"), t("b")],
      today: [t("c"), t("d")],
    };
    const op: TaskCacheOp<T> = {
      kind: "complete",
      ids: ["a", "d"],
      completedAt: COMPLETED_AT,
    };
    const next = applyOpToTodayView(view, op);
    expect(next.overdue.map((x) => x.id)).toEqual(["b"]);
    expect(next.today.map((x) => x.id)).toEqual(["c"]);
  });
});

describe("applyOpToLabelView", () => {
  it("transforms tasks while preserving the wrapper", () => {
    const view = { label: { id: "L1", name: "home" }, tasks: [t("a"), t("b")] };
    const op: TaskCacheOp<T> = { kind: "remove", ids: ["a"] };
    const next = applyOpToLabelView(view, op);
    expect(next.label).toBe(view.label);
    expect(next.tasks.map((x) => x.id)).toEqual(["b"]);
  });
});

describe("applyOpToProjectView", () => {
  // Root A (children A1 -> A1a, A2); section S holds B.
  const makeView = () => ({
    project: { id: "P" },
    rootTasks: [
      node(t("A"), [node(t("A1"), [node(t("A1a"))]), node(t("A2"))]),
    ],
    sections: [{ section: { id: "S" }, tasks: [node(t("B"))] }],
  });

  it("removes a cascade-completed subtree when completed are hidden", () => {
    const view = makeView();
    const op: TaskCacheOp<T> = {
      kind: "complete",
      ids: ["A", "A1", "A1a", "A2"],
      completedAt: COMPLETED_AT,
    };
    const next = applyOpToProjectView(view, op, false);
    expect(next.rootTasks).toHaveLength(0);
    expect(next.sections[0].tasks.map((n) => n.task.id)).toEqual(["B"]);
  });

  it("patches completedAt in place when completed are shown", () => {
    const view = makeView();
    const op: TaskCacheOp<T> = {
      kind: "complete",
      ids: ["A", "A1", "A1a", "A2"],
      completedAt: COMPLETED_AT,
    };
    const next = applyOpToProjectView(view, op, true);
    const root = next.rootTasks[0];
    expect(root.task.completedAt).toEqual(COMPLETED_AT);
    expect(root.subtasks[0].task.completedAt).toEqual(COMPLETED_AT);
    expect(root.subtasks[0].subtasks[0].task.completedAt).toEqual(COMPLETED_AT);
  });

  it("reopens only the targeted task", () => {
    const view = {
      project: { id: "P" },
      rootTasks: [
        node(t("A", { completedAt: COMPLETED_AT }), [
          node(t("A1", { completedAt: COMPLETED_AT })),
        ]),
      ],
      sections: [],
    };
    const next = applyOpToProjectView(view, { kind: "reopen", id: "A1" }, true);
    expect(next.rootTasks[0].task.completedAt).toEqual(COMPLETED_AT);
    expect(next.rootTasks[0].subtasks[0].task.completedAt).toBeNull();
  });

  it("removes a subtree on delete and leaves siblings", () => {
    const view = makeView();
    const op: TaskCacheOp<T> = { kind: "remove", ids: ["A1"] };
    const next = applyOpToProjectView(view, op, false);
    expect(next.rootTasks[0].subtasks.map((n) => n.task.id)).toEqual(["A2"]);
  });

  it("drops a relocated subtree from the project tree", () => {
    const view = makeView();
    const op: TaskCacheOp<T> = {
      kind: "relocate",
      ids: ["A1", "A1a"],
      patch: { priority: 1 },
    };
    const next = applyOpToProjectView(view, op, false);
    expect(next.rootTasks[0].subtasks.map((n) => n.task.id)).toEqual(["A2"]);
    // The relocate patch must not bleed into tasks that stayed.
    expect(next.rootTasks[0].task.priority).toBe(4);
  });

  it("patches a section task without mutating the original tree", () => {
    const view = makeView();
    const op: TaskCacheOp<T> = {
      kind: "patch",
      id: "B",
      patch: { title: "renamed" },
    };
    const next = applyOpToProjectView(view, op, false);
    expect(next.sections[0].tasks[0].task.title).toBe("renamed");
    expect(view.sections[0].tasks[0].task.title).toBe("B");
    // Untouched tasks keep their object identity even as wrappers rebuild.
    expect(next.rootTasks[0].task).toBe(view.rootTasks[0].task);
    expect(next.rootTasks[0]).not.toBe(view.rootTasks[0]);
  });
});

describe("collectSubtreeIds", () => {
  const forest = [
    node(t("A"), [node(t("A1"), [node(t("A1a"))]), node(t("A2"))]),
    node(t("B")),
  ];

  it("returns the node plus all descendants in pre-order", () => {
    expect(collectSubtreeIds(forest, "A")).toEqual(["A", "A1", "A1a", "A2"]);
  });

  it("finds a nested node", () => {
    expect(collectSubtreeIds(forest, "A1")).toEqual(["A1", "A1a"]);
  });

  it("returns a lone id for a leaf", () => {
    expect(collectSubtreeIds(forest, "B")).toEqual(["B"]);
  });

  it("returns empty when the id is absent", () => {
    expect(collectSubtreeIds(forest, "Z")).toEqual([]);
  });
});
