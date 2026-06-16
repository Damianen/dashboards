// MCP tools — thin adapters over the service layer. Each tool: validates its
// agent-facing input (the registered Zod shape), resolves names to ids,
// translates due_iso, calls exactly one service function, and serializes the
// result. No business logic lives here. Domain errors are funnelled through
// the same mapError() the server actions use, so agents see a stable error
// vocabulary (NOT_FOUND, VALIDATION, …) instead of stack traces.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { parseDueIso } from "@/lib/dates";
import {
  addCommentShape,
  completeTaskShape,
  createProjectShape,
  createTaskShape,
  getTaskShape,
  listProjectsShape,
  listTasksShape,
  moveTaskShape,
  reopenTaskShape,
  updateTaskShape,
  type TaskMoveInput,
  type TaskUpdateInput,
} from "@/lib/schemas";
import { mapError } from "@/server/actions/result";
import { addComment } from "@/server/services/comments";
import { InvalidOperationError } from "@/server/services/errors";
import { createProject, getProjectTree } from "@/server/services/projects";
import {
  resolveLabelNames,
  resolveProjectByName,
  resolveSectionByName,
} from "@/server/services/resolvers";
import {
  completeTask,
  createTask,
  getTask,
  listOverdue,
  listTasksByProject,
  listToday,
  listUpcoming,
  moveTask,
  reopenTask,
  updateTask,
} from "@/server/services/tasks";

import { flattenTree, serializeProject, serializeTask } from "./serialize";

const UPCOMING_DAYS = 7;

function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/** Run a tool body, folding any domain error into an agent-readable result. */
async function runTool(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return jsonResult(await fn());
  } catch (err) {
    const { code, message } = mapError(err);
    return {
      content: [{ type: "text", text: `${code}: ${message}` }],
      isError: true,
    };
  }
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "create_task",
    {
      title: "Create task",
      description:
        "Create a task. Defaults to the Inbox when project_name is omitted. priority 1 = highest, 4 = default. Labels in label_names are created if they don't exist; project_name and section_name must already exist.",
      inputSchema: createTaskShape,
    },
    ({ content, description, project_name, section_name, label_names, priority, due_iso }) =>
      runTool(async () => {
        if (section_name && !project_name)
          throw new InvalidOperationError("section_name requires project_name");
        const projectId = project_name
          ? (await resolveProjectByName(project_name)).id
          : undefined;
        const sectionId =
          section_name && projectId
            ? (await resolveSectionByName(projectId, section_name)).id
            : undefined;
        const labelIds = label_names?.length
          ? await resolveLabelNames(label_names)
          : undefined;
        const due = due_iso ? parseDueIso(due_iso) : undefined;
        const task = await createTask({
          title: content,
          description,
          projectId,
          sectionId,
          labelIds,
          priority,
          ...(due ? { dueAt: due.dueAt, hasDueTime: due.hasDueTime } : {}),
        });
        return serializeTask(task);
      }),
  );

  server.registerTool(
    "list_tasks",
    {
      title: "List tasks",
      description:
        "List tasks either for one project (project_name) or via a cross-project view (today / upcoming / overdue). Provide exactly one of project_name or view. Views only contain incomplete tasks; include_completed applies to a project listing.",
      inputSchema: listTasksShape,
      annotations: { readOnlyHint: true },
    },
    ({ project_name, view, include_completed }) =>
      runTool(async () => {
        if ((project_name === undefined) === (view === undefined))
          throw new InvalidOperationError(
            "provide exactly one of project_name or view",
          );
        if (view !== undefined) {
          const tasks =
            view === "today"
              ? await listToday()
              : view === "overdue"
                ? await listOverdue()
                : await listUpcoming(UPCOMING_DAYS);
          return tasks.map((t) => serializeTask(t));
        }
        const project = await resolveProjectByName(project_name!);
        const view_ = await listTasksByProject(project.id, {
          includeCompleted: include_completed,
        });
        const all = [
          ...flattenTree(view_.rootTasks),
          ...view_.sections.flatMap((s) => flattenTree(s.tasks)),
        ];
        return all.map((t) => serializeTask(t));
      }),
  );

  server.registerTool(
    "get_task",
    {
      title: "Get task",
      description: "Fetch a single task by id, including its labels.",
      inputSchema: getTaskShape,
      annotations: { readOnlyHint: true },
    },
    ({ task_id }) => runTool(async () => serializeTask(await getTask(task_id))),
  );

  server.registerTool(
    "update_task",
    {
      title: "Update task",
      description:
        "Edit a task's fields. Only the fields you pass change. due_iso: null clears the due date; label_names replaces the whole label set (pass [] to clear). To move a task between projects/sections use move_task; to complete it use complete_task.",
      inputSchema: updateTaskShape,
    },
    ({ task_id, content, description, priority, due_iso, label_names }) =>
      runTool(async () => {
        const input: TaskUpdateInput = {};
        if (content !== undefined) input.title = content;
        if (description !== undefined) input.description = description;
        if (priority !== undefined) input.priority = priority;
        if (due_iso !== undefined) {
          if (due_iso === null) {
            input.dueAt = null;
          } else {
            const due = parseDueIso(due_iso);
            input.dueAt = due.dueAt;
            input.hasDueTime = due.hasDueTime;
          }
        }
        if (label_names !== undefined)
          input.labelIds = await resolveLabelNames(label_names);
        return serializeTask(await updateTask(task_id, input));
      }),
  );

  server.registerTool(
    "complete_task",
    {
      title: "Complete task",
      description:
        "Mark a task complete. Incomplete subtasks are completed too. (Recurring tasks are not yet supported and will error.) Idempotent.",
      inputSchema: completeTaskShape,
      annotations: { idempotentHint: true },
    },
    ({ task_id }) =>
      runTool(async () => {
        const { completedDescendantIds } = await completeTask(task_id);
        return {
          task: serializeTask(await getTask(task_id)),
          completed_subtasks: completedDescendantIds.length,
        };
      }),
  );

  server.registerTool(
    "reopen_task",
    {
      title: "Reopen task",
      description:
        "Reopen a completed task. Only the task itself is reopened — subtasks completed in a cascade stay completed. Idempotent.",
      inputSchema: reopenTaskShape,
      annotations: { idempotentHint: true },
    },
    ({ task_id }) =>
      runTool(async () => {
        await reopenTask(task_id);
        return serializeTask(await getTask(task_id));
      }),
  );

  server.registerTool(
    "move_task",
    {
      title: "Move task",
      description:
        "Move a task to another project and/or section. Provide project_name, section_name, or both; section_name resolves within the destination project (or the task's current project if no project_name is given). A cross-project move brings subtasks along.",
      inputSchema: moveTaskShape,
    },
    ({ task_id, project_name, section_name }) =>
      runTool(async () => {
        if (!project_name && !section_name)
          throw new InvalidOperationError(
            "provide project_name and/or section_name",
          );
        const input: TaskMoveInput = {};
        let projectId: string | undefined;
        if (project_name) {
          projectId = (await resolveProjectByName(project_name)).id;
          input.projectId = projectId;
        }
        if (section_name) {
          const pid = projectId ?? (await getTask(task_id)).projectId;
          input.sectionId = (await resolveSectionByName(pid, section_name)).id;
        }
        return serializeTask(await moveTask(task_id, input));
      }),
  );

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description:
        "List projects (Inbox first), each with its sections and incomplete task count.",
      inputSchema: listProjectsShape,
      annotations: { readOnlyHint: true },
    },
    ({ include_archived }) =>
      runTool(async () => {
        const tree = await getProjectTree({ includeArchived: include_archived });
        return tree.map((p) => serializeProject(p));
      }),
  );

  server.registerTool(
    "create_project",
    {
      title: "Create project",
      description: "Create a new project.",
      inputSchema: createProjectShape,
    },
    ({ name }) =>
      runTool(async () => serializeProject(await createProject({ name }))),
  );

  server.registerTool(
    "add_comment",
    {
      title: "Add comment",
      description:
        "Add a comment to a task (task_id) or a project (project_name). Provide exactly one target.",
      inputSchema: addCommentShape,
    },
    ({ task_id, project_name, body }) =>
      runTool(async () => {
        if ((task_id === undefined) === (project_name === undefined))
          throw new InvalidOperationError(
            "provide exactly one of task_id or project_name",
          );
        const comment = task_id
          ? await addComment({ taskId: task_id, body })
          : await addComment({
              projectId: (await resolveProjectByName(project_name!)).id,
              body,
            });
        return {
          id: comment.id,
          body: comment.body,
          created_at: comment.createdAt.toISOString(),
        };
      }),
  );
}
