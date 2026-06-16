"use client";

import { AnimatePresence } from "motion/react";

import type { TaskTreeNode } from "@/server/services/task-tree";
import type { TaskWithLabels } from "@/server/services/tasks";

import { TaskItem } from "./task-item";

/** Flat incomplete list (today / upcoming / label / search). */
export function TaskList({
  tasks,
  showProject,
  projectNames,
}: {
  tasks: TaskWithLabels[];
  showProject?: boolean;
  projectNames?: Map<string, string>;
}) {
  return (
    <ul>
      <AnimatePresence initial={false}>
        {tasks.map((task) => (
          <TaskItem
            key={task.id}
            node={{ task, subtasks: [] }}
            depth={0}
            showProject={showProject}
            projectName={projectNames?.get(task.projectId)}
          />
        ))}
      </AnimatePresence>
    </ul>
  );
}

/** Nested tree (project view): subtasks render inside their parent's row. */
export function TaskTreeList({
  nodes,
  depth = 0,
  showProject,
  projectNames,
}: {
  nodes: TaskTreeNode<TaskWithLabels>[];
  depth?: number;
  showProject?: boolean;
  projectNames?: Map<string, string>;
}) {
  return (
    <ul>
      <AnimatePresence initial={false}>
        {nodes.map((node) => (
          <TaskItem
            key={node.task.id}
            node={node}
            depth={depth}
            showProject={showProject}
            projectName={projectNames?.get(node.task.projectId)}
          />
        ))}
      </AnimatePresence>
    </ul>
  );
}
