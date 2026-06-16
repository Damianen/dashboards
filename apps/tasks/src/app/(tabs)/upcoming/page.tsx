import { UpcomingView } from "@/components/views/upcoming-view";
import { getProjectTree } from "@/server/services/projects";
import { listUpcoming } from "@/server/services/tasks";

export const dynamic = "force-dynamic";

export default async function UpcomingPage() {
  const [tasks, tree] = await Promise.all([
    listUpcoming(14),
    getProjectTree(),
  ]);
  return <UpcomingView initialData={tasks} initialTree={tree} />;
}
