"use client";

import * as React from "react";
import { m, useReducedMotion } from "motion/react";

import { useSheets } from "@/components/providers/sheet-provider";
import { useCompleteTask, useReopenTask } from "@/hooks/use-task-mutations";
import { cn } from "@/lib/utils";
import type { TaskTreeNode } from "@/server/services/task-tree";
import type { TaskWithLabels } from "@/server/services/tasks";

import { DueChip } from "./due-chip";
import { LabelChips } from "./label-chips";
import { TaskCheckbox } from "./task-checkbox";
import { TaskTreeList } from "./task-list";

const INDENT_PX = 28;
// Let the satisfying check finish before the row collapses out.
const COMPLETE_DELAY_MS = 320;

export interface TaskItemProps {
  node: TaskTreeNode<TaskWithLabels>;
  depth: number;
  showProject?: boolean;
  projectName?: string;
}

/**
 * One task row plus its nested subtasks, inside a single <li> so a cascade
 * complete collapses the whole block as one. The inner swipe-surface div is
 * where phase-5 gestures will translate; the row never restructures.
 */
export function TaskItem({
  node,
  depth,
  showProject,
  projectName,
}: TaskItemProps) {
  const { task } = node;
  const done = task.completedAt !== null;
  const complete = useCompleteTask();
  const reopen = useReopenTask();
  const { openTaskDetail } = useSheets();
  const reduce = useReducedMotion();
  const [completing, setCompleting] = React.useState(false);

  const checked = done || completing;

  function handleToggle() {
    if (done) {
      reopen.mutate(task.id);
      return;
    }
    if (completing) return; // guard against a double tap during the animation
    setCompleting(true);
    const fire = () =>
      complete.mutate(task.id, { onError: () => setCompleting(false) });
    if (reduce) fire();
    else window.setTimeout(fire, COMPLETE_DELAY_MS);
  }

  const hasMeta =
    task.dueAt !== null ||
    task.labels.length > 0 ||
    (showProject === true && projectName !== undefined);

  return (
    <m.li
      layout="position"
      exit={reduce ? undefined : { height: 0, opacity: 0 }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      className="relative overflow-hidden"
    >
      <div
        data-slot="swipe-surface"
        className="flex min-h-[52px] items-start gap-3 border-b border-border/60 bg-background py-2 pr-1"
        style={{ paddingLeft: depth * INDENT_PX }}
      >
        <div className="pt-0.5">
          <TaskCheckbox
            checked={checked}
            priority={task.priority}
            onToggle={handleToggle}
            title={task.title}
          />
        </div>
        <button
          type="button"
          onClick={() => openTaskDetail(task)}
          className="flex min-w-0 flex-1 flex-col items-start gap-1 py-0.5 text-left"
        >
          <span
            data-completed={checked}
            className={cn(
              "task-title break-words text-sm",
              checked ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {task.title}
          </span>
          {hasMeta && (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {task.dueAt !== null && (
                <DueChip
                  dueAt={task.dueAt}
                  hasDueTime={task.hasDueTime}
                  timezone={task.timezone}
                />
              )}
              {showProject && projectName !== undefined && (
                <span className="text-xs text-muted-foreground">
                  {projectName}
                </span>
              )}
              <LabelChips labels={task.labels} />
            </span>
          )}
        </button>
      </div>
      {node.subtasks.length > 0 && (
        <TaskTreeList
          nodes={node.subtasks}
          depth={depth + 1}
          showProject={showProject}
          projectNames={undefined}
        />
      )}
    </m.li>
  );
}
