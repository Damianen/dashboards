"use client";

import * as React from "react";
import { CalendarClock, Check } from "lucide-react";
import {
  m,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from "motion/react";

import { useSheets } from "@/components/providers/sheet-provider";
import { useToast } from "@/components/providers/toast-provider";
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
// How far / fast a horizontal drag must go to trigger an action.
const SWIPE_THRESHOLD_PX = 80;
const SWIPE_VELOCITY = 500;

export interface TaskItemProps {
  node: TaskTreeNode<TaskWithLabels>;
  depth: number;
  showProject?: boolean;
  projectName?: string;
}

/**
 * One task row plus its nested subtasks, inside a single <li> so a cascade
 * complete collapses the whole block as one. The inner swipe-surface drags
 * horizontally over two action layers — right to complete (with an undo
 * toast), left to reschedule. Only the parent row is draggable; subtasks sit
 * outside the surface and never restructure.
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
  const { openTaskDetail, openReschedule } = useSheets();
  const { toast } = useToast();
  const reduce = useReducedMotion();
  const [completing, setCompleting] = React.useState(false);

  const x = useMotionValue(0);
  const completeOpacity = useTransform(x, [0, SWIPE_THRESHOLD_PX], [0, 1]);
  const rescheduleOpacity = useTransform(x, [-SWIPE_THRESHOLD_PX, 0], [1, 0]);

  const checked = done || completing;

  function runComplete(withUndo: boolean) {
    if (completing) return; // guard against a double trigger during the animation
    setCompleting(true);
    const fire = () =>
      complete.mutate(task.id, {
        onError: () => setCompleting(false),
        onSuccess: withUndo
          ? () =>
              toast({
                message: "Task completed",
                action: {
                  label: "Undo",
                  onClick: () => reopen.mutate(task.id),
                },
              })
          : undefined,
      });
    if (reduce) fire();
    else window.setTimeout(fire, COMPLETE_DELAY_MS);
  }

  function handleToggle() {
    if (done) {
      reopen.mutate(task.id);
      return;
    }
    runComplete(false);
  }

  function handleDragEnd(_event: unknown, info: PanInfo) {
    const { offset, velocity } = info;
    if (offset.x > SWIPE_THRESHOLD_PX || velocity.x > SWIPE_VELOCITY) {
      if (!done) runComplete(true);
    } else if (offset.x < -SWIPE_THRESHOLD_PX || velocity.x < -SWIPE_VELOCITY) {
      openReschedule(task);
    }
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
      <div className="relative">
        {/* Action layers revealed as the surface drags off them. */}
        <m.div
          aria-hidden
          style={{ opacity: completeOpacity }}
          className="absolute inset-0 flex items-center justify-start bg-emerald-600 px-5 text-white"
        >
          <Check className="size-5" />
        </m.div>
        <m.div
          aria-hidden
          style={{ opacity: rescheduleOpacity }}
          className="absolute inset-0 flex items-center justify-end bg-sky-600 px-5 text-white"
        >
          <CalendarClock className="size-5" />
        </m.div>

        <m.div
          data-slot="swipe-surface"
          drag={done ? false : "x"}
          dragDirectionLock
          dragSnapToOrigin
          dragElastic={0.1}
          dragMomentum={false}
          onDragEnd={handleDragEnd}
          style={{ x, paddingLeft: depth * INDENT_PX }}
          className="relative flex min-h-[52px] items-start gap-3 border-b border-border/60 bg-background py-2 pr-1 touch-pan-y"
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
        </m.div>
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
