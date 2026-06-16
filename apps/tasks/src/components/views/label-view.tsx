"use client";

import { Tag } from "lucide-react";
import * as React from "react";

import { EmptyState } from "@/components/tasks/empty-state";
import { TaskList } from "@/components/tasks/task-list";
import { useLabelView, useProjectTree } from "@/hooks/use-task-queries";
import type { ProjectTreeNode } from "@/server/services/projects";
import type { LabelTasksView } from "@/server/services/tasks";

import { ViewHeader } from "./view-header";

export function LabelView({
  labelId,
  initialData,
  initialTree,
}: {
  labelId: string;
  initialData: LabelTasksView;
  initialTree: ProjectTreeNode[];
}) {
  const { data } = useLabelView(labelId, initialData);
  const tree = useProjectTree(initialTree);
  const projectNames = React.useMemo(
    () => new Map((tree.data ?? []).map((p) => [p.id, p.name])),
    [tree.data],
  );

  const view = data ?? initialData;

  return (
    <div className="flex flex-col animate-in fade-in slide-in-from-bottom-1">
      <ViewHeader
        title={view.label.name}
        leading={
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full"
            style={{ backgroundColor: view.label.color }}
          />
        }
      />
      {view.tasks.length === 0 ? (
        <EmptyState
          icon={<Tag className="size-10" />}
          title="No tasks with this label"
        />
      ) : (
        <TaskList tasks={view.tasks} showProject projectNames={projectNames} />
      )}
    </div>
  );
}
