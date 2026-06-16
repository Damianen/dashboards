import { notFound } from "next/navigation";

import { FilterView } from "@/components/views/filter-view";
import type { SavedFilter } from "@/generated/prisma/client";
import { NotFoundError } from "@/server/services/errors";
import { getProjectTree, type ProjectTreeNode } from "@/server/services/projects";
import { getSavedFilter } from "@/server/services/saved-filters";
import { listTasksByFilter, type TaskWithLabels } from "@/server/services/tasks";

export const dynamic = "force-dynamic";

export default async function FilterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let filter: SavedFilter;
  let tree: ProjectTreeNode[];
  try {
    [filter, tree] = await Promise.all([getSavedFilter(id), getProjectTree()]);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  // A stored query should always compile (validated on save), but stay
  // defensive: leave initialTasks undefined so the view surfaces the error live.
  let initialTasks: TaskWithLabels[] | undefined;
  try {
    initialTasks = await listTasksByFilter(filter.query);
  } catch {
    initialTasks = undefined;
  }
  return (
    <FilterView
      filterId={id}
      initialFilter={filter}
      initialTasks={initialTasks}
      initialTree={tree}
    />
  );
}
