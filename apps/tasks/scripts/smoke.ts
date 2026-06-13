// End-to-end smoke test for the service layer, run against tasks_dev only.
// Exercises every service, prints a pass/fail summary, cleans up after itself.

import "dotenv/config";

import { DEFAULT_TIMEZONE, zonedDayStart } from "@/lib/dates";
import * as comments from "@/server/services/comments";
import * as labels from "@/server/services/labels";
import * as projects from "@/server/services/projects";
import * as sections from "@/server/services/sections";
import * as tasks from "@/server/services/tasks";
import { prisma } from "@/server/db";

// --- safety: never run against a non-dev database -------------------------

const dbName = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
  } catch {
    return "";
  }
})();
if (!dbName.endsWith("_dev")) {
  console.error(
    `Refusing to run: database "${dbName || "<unparseable>"}" does not end in _dev.`,
  );
  process.exit(1);
}

// --- mini harness ----------------------------------------------------------

let passed = 0;
const failures: { name: string; error: unknown }[] = [];

async function check(
  name: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push({ name, error });
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`  FAIL ${name}: ${msg}`);
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected)
    throw new Error(`${msg} (expected ${String(expected)}, got ${String(actual)})`);
}

async function expectError(
  fn: () => Promise<unknown> | unknown,
  errorName: string,
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === errorName) return;
    throw new Error(`expected ${errorName}, got ${name || String(e)}`);
  }
  throw new Error(`expected ${errorName}, but no error was thrown`);
}

// --- created-entity tracking for cleanup ------------------------------------

const runPrefix = `smoke-${Date.now()}`;
const allEntityIds: string[] = [];
const projectIds: string[] = [];
const labelIds: string[] = [];
const inboxTaskIds: string[] = [];

function track<T extends { id: string }>(entity: T, bucket?: string[]): T {
  allEntityIds.push(entity.id);
  bucket?.push(entity.id);
  return entity;
}

const evCount = (entityId: string, action: string) =>
  prisma.activityEvent.count({ where: { entityId, action } });

async function main() {
  console.log(`\nsmoke run ${runPrefix} against ${dbName}\n`);

  // == projects ==============================================================
  console.log("== projects ==");
  const projA = track(await projects.createProject({ name: `${runPrefix} A` }), projectIds);
  const projB = track(await projects.createProject({ name: `${runPrefix} B` }), projectIds);
  const inbox = await prisma.project.findFirstOrThrow({ where: { isInbox: true } });

  await check("createProject writes project.created", async () => {
    assert((await evCount(projA.id, "project.created")) === 1, "missing event");
  });
  await check("updateProject renames", async () => {
    const renamed = await projects.updateProject(projA.id, { name: `${runPrefix} A2` });
    assertEqual(renamed.name, `${runPrefix} A2`, "name");
  });
  await check("setProjectFavorite is idempotent (one event)", async () => {
    const fav = await projects.setProjectFavorite(projA.id, true);
    assert(fav.isFavorite, "isFavorite");
    await projects.setProjectFavorite(projA.id, true);
    assertEqual(await evCount(projA.id, "project.favorited"), 1, "event count");
  });
  await check("archive hides from tree, includeArchived shows it", async () => {
    const archived = await projects.archiveProject(projB.id);
    assert(archived.archivedAt !== null, "archivedAt");
    const tree = await projects.getProjectTree();
    assert(!tree.some((p) => p.id === projB.id), "archived project in default tree");
    const full = await projects.getProjectTree({ includeArchived: true });
    assert(full.some((p) => p.id === projB.id), "archived project missing with flag");
    await projects.unarchiveProject(projB.id);
  });
  await check("reorderProject changes relative order", async () => {
    await projects.reorderProject(projB.id, { beforeId: projA.id });
    const tree = await projects.getProjectTree();
    const order = tree.map((p) => p.id).filter((pid) => pid === projA.id || pid === projB.id);
    assertEqual(order.join(","), `${projB.id},${projA.id}`, "relative order");
  });
  await check("tree pins Inbox first", async () => {
    const tree = await projects.getProjectTree();
    assertEqual(tree[0]?.isInbox, true, "first project isInbox");
  });
  await check("Inbox cannot be archived", () =>
    expectError(() => projects.archiveProject(inbox.id), "InvalidOperationError"));
  await check("Inbox cannot be deleted", () =>
    expectError(() => projects.deleteProject(inbox.id), "InvalidOperationError"));

  // == sections ==============================================================
  console.log("== sections ==");
  const s1 = track(await sections.createSection({ projectId: projA.id, name: `${runPrefix} s1` }));
  const s2 = track(await sections.createSection({ projectId: projA.id, name: `${runPrefix} s2` }));
  const s3 = track(await sections.createSection({ projectId: projA.id, name: `${runPrefix} s3` }));

  await check("createSection requires an existing project", () =>
    expectError(() => sections.createSection({ projectId: "nope", name: "x" }), "NotFoundError"));
  await check("updateSection renames", async () => {
    const renamed = await sections.updateSection(s1.id, { name: `${runPrefix} s1b` });
    assertEqual(renamed.name, `${runPrefix} s1b`, "name");
  });
  await check("reorderSection moves to front and back", async () => {
    await sections.reorderSection(s3.id, { beforeId: s1.id });
    let list = await sections.listSections(projA.id);
    assertEqual(list.map((s) => s.id).join(","), [s3.id, s1.id, s2.id].join(","), "front");
    await sections.reorderSection(s3.id, { afterId: s2.id });
    list = await sections.listSections(projA.id);
    assertEqual(list.map((s) => s.id).join(","), [s1.id, s2.id, s3.id].join(","), "back");
  });
  await check("deleteSection re-roots its tasks", async () => {
    const sX = track(await sections.createSection({ projectId: projA.id, name: `${runPrefix} sX` }));
    const tX = track(
      await tasks.createTask({ title: `${runPrefix} in-section`, projectId: projA.id, sectionId: sX.id }),
    );
    await sections.deleteSection(sX.id);
    const reloaded = await prisma.task.findUniqueOrThrow({ where: { id: tX.id } });
    assertEqual(reloaded.sectionId, null, "sectionId after section delete");
    await tasks.deleteTask(tX.id);
  });

  // == labels ================================================================
  console.log("== labels ==");
  const la = track(await labels.createLabel({ name: `${runPrefix}-urgent`, color: "#ff0000" }), labelIds);
  const lb = track(await labels.createLabel({ name: `${runPrefix}-home` }), labelIds);

  await check("duplicate label name is rejected", () =>
    expectError(() => labels.createLabel({ name: `${runPrefix}-urgent` }), "InvalidOperationError"));
  await check("updateLabel changes color", async () => {
    const updated = await labels.updateLabel(lb.id, { color: "#00ff00" });
    assertEqual(updated.color, "#00ff00", "color");
  });
  await check("reorderLabel moves to front", async () => {
    await labels.reorderLabel(lb.id, { beforeId: la.id });
    const list = await labels.listLabels();
    const order = list.map((l) => l.id).filter((lid) => lid === la.id || lid === lb.id);
    assertEqual(order.join(","), `${lb.id},${la.id}`, "relative order");
  });
  await check("deleteLabel cascades TaskLabel rows", async () => {
    const lTmp = track(await labels.createLabel({ name: `${runPrefix}-tmp` }), labelIds);
    const tTmp = track(
      await tasks.createTask({ title: `${runPrefix} labeled`, projectId: projA.id, labelIds: [lTmp.id] }),
    );
    await labels.deleteLabel(lTmp.id);
    assertEqual(
      await prisma.taskLabel.count({ where: { taskId: tTmp.id } }),
      0,
      "TaskLabel rows",
    );
    await tasks.deleteTask(tTmp.id);
  });

  // == tasks =================================================================
  console.log("== tasks ==");
  await check("createTask defaults to the Inbox", async () => {
    const t = track(await tasks.createTask({ title: `${runPrefix} inbox-task` }), inboxTaskIds);
    assertEqual(t.projectId, inbox.id, "projectId");
  });
  const allDay = track(
    await tasks.createTask({
      title: `${runPrefix} all-day`,
      projectId: projA.id,
      dueAt: "2026-06-20T15:45:00Z",
    }),
  );
  await check("all-day dueAt normalizes to local midnight", () => {
    assertEqual(
      allDay.dueAt?.toISOString(),
      zonedDayStart(new Date("2026-06-20T15:45:00Z"), DEFAULT_TIMEZONE).toISOString(),
      "normalized dueAt",
    );
  });
  const t1 = track(
    await tasks.createTask({
      title: `${runPrefix} t1`,
      projectId: projA.id,
      priority: 1,
      labelIds: [la.id],
    }),
  );
  await check("createTask attaches labels", () => {
    assertEqual(t1.labels.map((l) => l.id).join(","), la.id, "labels");
  });
  const sub1 = track(await tasks.createTask({ title: `${runPrefix} sub1`, parentId: t1.id }));
  const sub2 = track(await tasks.createTask({ title: `${runPrefix} sub2`, parentId: sub1.id }));
  await check("subtask inherits the parent's project, no section", () => {
    assertEqual(sub1.projectId, projA.id, "projectId");
    assertEqual(sub1.sectionId, null, "sectionId");
  });
  await check("conflicting projectId vs parent is rejected", () =>
    expectError(
      () => tasks.createTask({ title: "x", parentId: t1.id, projectId: projB.id }),
      "InvalidMoveError",
    ));
  await check("sectionId + parentId together fail zod", () =>
    expectError(
      () => tasks.createTask({ title: "x", sectionId: s1.id, parentId: t1.id }),
      "ZodError",
    ));
  await check("unknown labelId is rejected", () =>
    expectError(
      () => tasks.createTask({ title: "x", projectId: projA.id, labelIds: ["nope"] }),
      "NotFoundError",
    ));
  await check("tree reports incomplete task counts", async () => {
    const tree = await projects.getProjectTree();
    const nodeA = tree.find((p) => p.id === projA.id);
    assertEqual(nodeA?.incompleteTaskCount, 4, "count for A"); // allDay, t1, sub1, sub2
  });
  await check("moveTask into a section", async () => {
    const moved = await tasks.moveTask(t1.id, { sectionId: s1.id });
    assertEqual(moved.sectionId, s1.id, "sectionId");
    assert((await evCount(t1.id, "task.moved")) >= 1, "task.moved event");
  });
  await check("updateTask replaces the label set", async () => {
    let updated = await tasks.updateTask(t1.id, { labelIds: [lb.id] });
    assertEqual(updated.labels.map((l) => l.id).join(","), lb.id, "replaced");
    updated = await tasks.updateTask(t1.id, { labelIds: [] });
    assertEqual(updated.labels.length, 0, "cleared");
  });
  await check("updateTask clears and re-normalizes dueAt", async () => {
    const cleared = await tasks.updateTask(allDay.id, { dueAt: null });
    assertEqual(cleared.dueAt, null, "cleared dueAt");
    const reset = await tasks.updateTask(allDay.id, { dueAt: "2026-06-21T13:00:00Z" });
    assertEqual(
      reset.dueAt?.toISOString(),
      zonedDayStart(new Date("2026-06-21T13:00:00Z"), DEFAULT_TIMEZONE).toISOString(),
      "re-normalized dueAt",
    );
  });
  await check("cross-project move brings descendants along", async () => {
    const moved = await tasks.moveTask(t1.id, { projectId: projB.id });
    assertEqual(moved.projectId, projB.id, "t1 project");
    assertEqual(moved.sectionId, null, "t1 section reset");
    const sub1Re = await prisma.task.findUniqueOrThrow({ where: { id: sub1.id } });
    const sub2Re = await prisma.task.findUniqueOrThrow({ where: { id: sub2.id } });
    assertEqual(sub1Re.projectId, projB.id, "sub1 project");
    assertEqual(sub2Re.projectId, projB.id, "sub2 project");
    assertEqual(sub1Re.parentId, t1.id, "sub1 keeps parent");
  });
  await check("cycle moves are rejected", async () => {
    await expectError(() => tasks.moveTask(t1.id, { parentId: sub2.id }), "InvalidMoveError");
    await expectError(() => tasks.moveTask(t1.id, { parentId: t1.id }), "InvalidMoveError");
  });
  await check("detach and re-attach a subtask", async () => {
    const detached = await tasks.moveTask(sub2.id, { parentId: null });
    assertEqual(detached.parentId, null, "detached");
    const attached = await tasks.moveTask(sub2.id, { parentId: sub1.id });
    assertEqual(attached.parentId, sub1.id, "re-attached");
  });

  const x1 = track(await tasks.createTask({ title: `${runPrefix} x1`, projectId: projB.id }));
  const x2 = track(await tasks.createTask({ title: `${runPrefix} x2`, projectId: projB.id }));
  const x3 = track(await tasks.createTask({ title: `${runPrefix} x3`, projectId: projB.id }));
  const xIds = [x1.id, x2.id, x3.id];
  const rootOrder = async () => {
    const view = await tasks.listTasksByProject(projB.id);
    return view.rootTasks.map((n) => n.task.id).filter((tid) => xIds.includes(tid));
  };
  await check("reorder via beforeId / afterId", async () => {
    assertEqual((await rootOrder()).join(","), [x1.id, x2.id, x3.id].join(","), "initial");
    await tasks.moveTask(x3.id, { beforeId: x1.id });
    assertEqual((await rootOrder()).join(","), [x3.id, x1.id, x2.id].join(","), "to front");
    await tasks.moveTask(x3.id, { afterId: x1.id });
    assertEqual((await rootOrder()).join(","), [x1.id, x3.id, x2.id].join(","), "after x1");
    await tasks.moveTask(x3.id, { afterId: x2.id });
    assertEqual((await rootOrder()).join(","), [x1.id, x2.id, x3.id].join(","), "to back");
    assert((await evCount(x3.id, "task.reordered")) >= 3, "task.reordered events");
  });
  await check("byProject nests subtasks under sections", async () => {
    const view = await tasks.listTasksByProject(projB.id);
    const t1Node = view.rootTasks.find((n) => n.task.id === t1.id);
    assert(t1Node, "t1 at root");
    assertEqual(t1Node.subtasks[0]?.task.id, sub1.id, "sub1 nested");
    assertEqual(t1Node.subtasks[0]?.subtasks[0]?.task.id, sub2.id, "sub2 nested");
  });

  const recurring = track(
    await tasks.createTask({ title: `${runPrefix} recurring`, projectId: projB.id, rrule: "FREQ=DAILY" }),
  );
  await check("completeTask refuses recurring tasks", () =>
    expectError(() => tasks.completeTask(recurring.id), "NotImplementedError"));

  await check("completeTask cascades to descendants atomically", async () => {
    const result = await tasks.completeTask(t1.id);
    assertEqual(
      [...result.completedDescendantIds].sort().join(","),
      [sub1.id, sub2.id].sort().join(","),
      "descendants",
    );
    const sub2Re = await prisma.task.findUniqueOrThrow({ where: { id: sub2.id } });
    assertEqual(
      sub2Re.completedAt?.getTime(),
      result.task.completedAt?.getTime(),
      "shared completedAt",
    );
    const cascadeEvent = await prisma.activityEvent.findFirst({
      where: { entityId: sub1.id, action: "task.completed" },
    });
    assertEqual(
      (cascadeEvent?.payload as { cascadedFrom?: string })?.cascadedFrom,
      t1.id,
      "cascadedFrom payload",
    );
  });
  await check("completeTask is idempotent (one event)", async () => {
    const again = await tasks.completeTask(t1.id);
    assertEqual(again.completedDescendantIds.length, 0, "no re-cascade");
    assertEqual(await evCount(t1.id, "task.completed"), 1, "event count");
  });
  await check("reopenTask reopens only itself", async () => {
    const reopened = await tasks.reopenTask(t1.id);
    assertEqual(reopened.completedAt, null, "t1 reopened");
    const sub1Re = await prisma.task.findUniqueOrThrow({ where: { id: sub1.id } });
    assert(sub1Re.completedAt !== null, "sub1 stays completed");
    await tasks.reopenTask(t1.id);
    assertEqual(await evCount(t1.id, "task.reopened"), 1, "idempotent event count");
  });

  // == views =================================================================
  console.log("== views ==");
  const now = new Date();
  const hour = 3_600_000;
  const o1 = track(
    await tasks.createTask({
      title: `${runPrefix} overdue-timed`,
      projectId: projA.id,
      dueAt: new Date(now.getTime() - 26 * hour),
      hasDueTime: true,
    }),
  );
  const o2 = track(
    await tasks.createTask({
      title: `${runPrefix} overdue-allday`,
      projectId: projA.id,
      dueAt: new Date(now.getTime() - 24 * hour),
    }),
  );
  const td = track(
    await tasks.createTask({ title: `${runPrefix} due-today`, projectId: projA.id, dueAt: now }),
  );
  const up3 = track(
    await tasks.createTask({
      title: `${runPrefix} due-in-3d`,
      projectId: projA.id,
      dueAt: new Date(now.getTime() + 3 * 24 * hour),
    }),
  );
  const far = track(
    await tasks.createTask({
      title: `${runPrefix} due-in-30d`,
      projectId: projA.id,
      dueAt: new Date(now.getTime() + 30 * 24 * hour),
    }),
  );

  await check("listToday contains exactly today's tasks", async () => {
    const ids = (await tasks.listToday()).map((t) => t.id);
    assert(ids.includes(td.id), "td missing");
    for (const [label, id] of [["o1", o1.id], ["o2", o2.id], ["up3", up3.id], ["far", far.id]] as const)
      assert(!ids.includes(id), `${label} wrongly included`);
  });
  await check("listOverdue catches timed and all-day", async () => {
    const ids = (await tasks.listOverdue()).map((t) => t.id);
    assert(ids.includes(o1.id), "o1 missing");
    assert(ids.includes(o2.id), "o2 missing");
    assert(!ids.includes(td.id), "td wrongly included");
    assert(!ids.includes(up3.id), "up3 wrongly included");
  });
  await check("listUpcoming(7) starts tomorrow", async () => {
    const ids = (await tasks.listUpcoming(7)).map((t) => t.id);
    assert(ids.includes(up3.id), "up3 missing");
    assert(!ids.includes(td.id), "td wrongly included");
    assert(!ids.includes(o1.id), "o1 wrongly included");
    assert(!ids.includes(far.id), "far wrongly included");
  });

  await check("listCompleted paginates without duplicates", async () => {
    await tasks.completeTask(x1.id);
    await tasks.completeTask(x2.id);
    const seen = new Map<string, number>();
    let cursor: string | undefined;
    for (let page = 0; page < 500; page++) {
      const res = await tasks.listCompleted({ cursor, limit: 5 });
      for (const item of res.items) seen.set(item.id, (seen.get(item.id) ?? 0) + 1);
      if (res.nextCursor === null) break;
      cursor = res.nextCursor;
    }
    for (const id of [x1.id, x2.id, sub1.id, sub2.id])
      assertEqual(seen.get(id), 1, `completed task ${id} page count`);
    assert(!seen.has(t1.id), "reopened t1 in completed history");
  });

  await check("searchTasks matches title and description, case-insensitive", async () => {
    const byTitle = track(
      await tasks.createTask({ title: `${runPrefix} Alpha BRAVO`, projectId: projA.id }),
    );
    const byDesc = track(
      await tasks.createTask({
        title: `${runPrefix} desc-holder`,
        projectId: projA.id,
        description: `${runPrefix}-NEEDLE in a haystack`,
      }),
    );
    const titleHits = (await tasks.searchTasks(`${runPrefix} alpha bravo`)).map((t) => t.id);
    assert(titleHits.includes(byTitle.id), "title match");
    const descHits = (await tasks.searchTasks(`${runPrefix}-needle`)).map((t) => t.id);
    assert(descHits.includes(byDesc.id), "description match");
    assertEqual((await tasks.searchTasks("   ")).length, 0, "blank query");
    await tasks.completeTask(byTitle.id);
    const afterComplete = (await tasks.searchTasks(`${runPrefix} alpha bravo`)).map((t) => t.id);
    assert(!afterComplete.includes(byTitle.id), "completed excluded by default");
    const withCompleted = (
      await tasks.searchTasks(`${runPrefix} alpha bravo`, { includeCompleted: true })
    ).map((t) => t.id);
    assert(withCompleted.includes(byTitle.id), "completed included with flag");
  });

  // == comments ==============================================================
  console.log("== comments ==");
  await check("add/list/delete on tasks and projects", async () => {
    const c1 = track(await comments.addComment({ taskId: t1.id, body: `${runPrefix} first` }));
    const c2 = track(await comments.addComment({ taskId: t1.id, body: `${runPrefix} second` }));
    const cp = track(await comments.addComment({ projectId: projA.id, body: `${runPrefix} on project` }));
    const onTask = await comments.listComments({ taskId: t1.id });
    assertEqual(onTask.length, 2, "task comment count");
    assert(onTask[0].createdAt.getTime() <= onTask[1].createdAt.getTime(), "ascending order");
    const onProject = await comments.listComments({ projectId: projA.id });
    assertEqual(onProject.map((c) => c.id).join(","), cp.id, "project comment");
    await comments.deleteComment(c2.id);
    assertEqual((await comments.listComments({ taskId: t1.id })).map((c) => c.id).join(","), c1.id, "after delete");
  });
  await check("comment target XOR is enforced by zod", async () => {
    await expectError(
      () => comments.addComment({ body: "x" } as never),
      "ZodError",
    );
    await expectError(
      () => comments.addComment({ body: "x", taskId: t1.id, projectId: projA.id } as never),
      "ZodError",
    );
  });
  await check("comment on a missing target is rejected", () =>
    expectError(() => comments.addComment({ taskId: "nope", body: "x" }), "NotFoundError"));
  await check("deleting a task removes its comments", async () => {
    const cc = track(await comments.addComment({ taskId: x3.id, body: `${runPrefix} doomed` }));
    await tasks.deleteTask(x3.id);
    assertEqual(await prisma.comment.count({ where: { id: cc.id } }), 0, "comment count");
  });

  // == activity ==============================================================
  console.log("== activity ==");
  await check("every mutation family wrote events", async () => {
    const expectations: [string, string][] = [
      [projA.id, "project.created"],
      [projA.id, "project.updated"],
      [projB.id, "project.archived"],
      [projB.id, "project.unarchived"],
      [s3.id, "section.reordered"],
      [la.id, "label.created"],
      [lb.id, "label.updated"],
      [t1.id, "task.created"],
      [t1.id, "task.updated"],
      [t1.id, "task.moved"],
      [t1.id, "task.completed"],
      [t1.id, "task.reopened"],
      [x3.id, "task.deleted"],
    ];
    for (const [entityId, action] of expectations)
      assert((await evCount(entityId, action)) >= 1, `missing ${action} for ${entityId}`);
  });
}

main()
  .catch((error) => {
    failures.push({ name: "fatal: smoke run aborted", error });
    console.error("\nFATAL:", error);
  })
  .finally(async () => {
    try {
      await prisma.task.deleteMany({ where: { id: { in: inboxTaskIds } } });
      await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
      await prisma.label.deleteMany({ where: { id: { in: labelIds } } });
      await prisma.activityEvent.deleteMany({ where: { entityId: { in: allEntityIds } } });
    } catch (error) {
      console.error("cleanup failed:", error);
    }
    await prisma.$disconnect();

    console.log(`\n${passed} passed, ${failures.length} failed`);
    for (const f of failures) {
      const msg = f.error instanceof Error ? f.error.message : String(f.error);
      console.log(`  ✗ ${f.name}: ${msg}`);
    }
    process.exitCode = failures.length > 0 ? 1 : 0;
  });
