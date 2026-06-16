"use client";

import { CalendarDays } from "lucide-react";
import * as React from "react";

import { EmptyState } from "@/components/tasks/empty-state";
import { TaskGroup } from "@/components/tasks/task-group";
import { TaskList } from "@/components/tasks/task-list";
import { DEFAULT_TIMEZONE, formatDayHeading } from "@/lib/dates";
import { groupByDueDay } from "@/lib/group-tasks";
import { useProjectTree, useUpcoming } from "@/hooks/use-task-queries";
import type { ProjectTreeNode } from "@/server/services/projects";
import type { TaskWithLabels } from "@/server/services/tasks";

const UPCOMING_DAYS = 14;

export function UpcomingView({
  initialData,
  initialTree,
}: {
  initialData: TaskWithLabels[];
  initialTree: ProjectTreeNode[];
}) {
  const { data } = useUpcoming(UPCOMING_DAYS, initialData);
  const tree = useProjectTree(initialTree);
  const projectNames = React.useMemo(
    () => new Map((tree.data ?? []).map((p) => [p.id, p.name])),
    [tree.data],
  );
  const groups = React.useMemo(
    () => groupByDueDay(data ?? [], DEFAULT_TIMEZONE),
    [data],
  );

  return (
    <div className="flex flex-col animate-in fade-in slide-in-from-bottom-1">
      <h1 className="py-3 text-2xl font-semibold">Upcoming</h1>
      {groups.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="size-10" />}
          title="Nothing scheduled"
          hint={`No tasks due in the next ${UPCOMING_DAYS} days.`}
        />
      ) : (
        groups.map((group) => (
          <TaskGroup
            key={group.dayKey}
            title={formatDayHeading(group.dayStart, DEFAULT_TIMEZONE)}
            count={group.tasks.length}
          >
            <TaskList
              tasks={group.tasks}
              showProject
              projectNames={projectNames}
            />
          </TaskGroup>
        ))
      )}
    </div>
  );
}
