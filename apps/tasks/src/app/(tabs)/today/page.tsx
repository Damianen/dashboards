import { TodayView } from "@/components/views/today-view";
import { getProjectTree } from "@/server/services/projects";
import { listOverdue, listToday } from "@/server/services/tasks";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const [overdue, today, tree] = await Promise.all([
    listOverdue(),
    listToday(),
    getProjectTree(),
  ]);
  return <TodayView initialData={{ overdue, today }} initialTree={tree} />;
}
