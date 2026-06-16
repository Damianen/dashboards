import { notFound } from "next/navigation";

import { LabelView } from "@/components/views/label-view";
import { NotFoundError } from "@/server/services/errors";
import { getProjectTree, type ProjectTreeNode } from "@/server/services/projects";
import { listTasksByLabel, type LabelTasksView } from "@/server/services/tasks";

export const dynamic = "force-dynamic";

export default async function LabelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let view: LabelTasksView;
  let tree: ProjectTreeNode[];
  try {
    [view, tree] = await Promise.all([
      listTasksByLabel(id),
      getProjectTree(),
    ]);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  return <LabelView labelId={id} initialData={view} initialTree={tree} />;
}
