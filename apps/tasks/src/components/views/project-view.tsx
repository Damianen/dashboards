"use client";

import { Eye, EyeOff, Inbox } from "lucide-react";
import * as React from "react";

import { EmptyState } from "@/components/tasks/empty-state";
import { TaskGroup } from "@/components/tasks/task-group";
import { TaskTreeList } from "@/components/tasks/task-list";
import { useProjectView } from "@/hooks/use-task-queries";
import { cn } from "@/lib/utils";
import type { ProjectTasksView } from "@/server/services/tasks";

import { ViewHeader } from "./view-header";

export function ProjectView({
  projectId,
  initialData,
}: {
  projectId: string;
  initialData: ProjectTasksView;
}) {
  const [includeCompleted, setIncludeCompleted] = React.useState(false);
  const query = useProjectView(
    projectId,
    includeCompleted,
    includeCompleted ? undefined : initialData,
  );
  // Falling back to initialData keeps the list filled while the toggled query
  // loads its variant.
  const view = query.data ?? initialData;
  const empty =
    view.rootTasks.length === 0 &&
    view.sections.every((s) => s.tasks.length === 0);

  return (
    <div className="flex flex-col animate-in fade-in slide-in-from-bottom-1">
      <ViewHeader
        title={view.project.name}
        leading={
          view.project.isInbox ? (
            <Inbox className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          ) : undefined
        }
        action={
          <button
            type="button"
            aria-pressed={includeCompleted}
            aria-label={
              includeCompleted ? "Hide completed tasks" : "Show completed tasks"
            }
            onClick={() => setIncludeCompleted((v) => !v)}
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-full active:bg-muted",
              includeCompleted ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {includeCompleted ? (
              <Eye className="size-5" aria-hidden />
            ) : (
              <EyeOff className="size-5" aria-hidden />
            )}
          </button>
        }
      />

      {empty ? (
        <EmptyState title="No tasks here yet" hint="Add one with the + button." />
      ) : (
        <div className="pt-1">
          {view.rootTasks.length > 0 && <TaskTreeList nodes={view.rootTasks} />}
          {view.sections.map((section) => (
            <TaskGroup key={section.section.id} title={section.section.name}>
              {section.tasks.length > 0 ? (
                <TaskTreeList nodes={section.tasks} />
              ) : (
                <p className="px-1 py-2 text-xs text-muted-foreground">
                  No tasks
                </p>
              )}
            </TaskGroup>
          ))}
        </div>
      )}
    </div>
  );
}
