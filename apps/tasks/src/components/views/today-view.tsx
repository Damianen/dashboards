"use client";

import { CalendarCheck } from "lucide-react";
import * as React from "react";

import { EmptyState } from "@/components/tasks/empty-state";
import { TaskGroup } from "@/components/tasks/task-group";
import { TaskList } from "@/components/tasks/task-list";
import {
  useProjectTree,
  useTodayView,
  type TodayView as TodayViewData,
} from "@/hooks/use-task-queries";
import type { ProjectTreeNode } from "@/server/services/projects";

export function TodayView({
  initialData,
  initialTree,
}: {
  initialData: TodayViewData;
  initialTree: ProjectTreeNode[];
}) {
  const { data } = useTodayView(initialData);
  const tree = useProjectTree(initialTree);
  const projectNames = React.useMemo(
    () => new Map((tree.data ?? []).map((p) => [p.id, p.name])),
    [tree.data],
  );

  const view = data ?? initialData;
  const empty = view.overdue.length === 0 && view.today.length === 0;

  return (
    <div className="flex flex-col animate-in fade-in slide-in-from-bottom-1">
      <h1 className="py-3 text-2xl font-semibold">Today</h1>
      {empty ? (
        <EmptyState
          icon={<CalendarCheck className="size-10" />}
          title="Nothing due today"
          hint="Enjoy the clear runway, or add something with +."
        />
      ) : (
        <>
          {view.overdue.length > 0 && (
            <TaskGroup
              title="Overdue"
              count={view.overdue.length}
              tone="overdue"
            >
              <TaskList
                tasks={view.overdue}
                showProject
                projectNames={projectNames}
              />
            </TaskGroup>
          )}
          {view.today.length > 0 && (
            <TaskGroup title="Today" count={view.today.length}>
              <TaskList
                tasks={view.today}
                showProject
                projectNames={projectNames}
              />
            </TaskGroup>
          )}
        </>
      )}
    </div>
  );
}
