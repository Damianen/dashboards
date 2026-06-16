import { notFound } from "next/navigation";

import { ProjectView } from "@/components/views/project-view";
import { NotFoundError } from "@/server/services/errors";
import { listTasksByProject, type ProjectTasksView } from "@/server/services/tasks";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let view: ProjectTasksView;
  try {
    view = await listTasksByProject(id, { includeCompleted: false });
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  return <ProjectView projectId={id} initialData={view} />;
}
