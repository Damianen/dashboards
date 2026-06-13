import type { Comment } from "@/generated/prisma/client";
import {
  commentCreateSchema,
  type CommentCreateInput,
} from "@/lib/schemas";
import { prisma } from "@/server/db";

import { logEvent } from "./activity";
import { NotFoundError } from "./errors";

export type CommentTarget = { taskId: string } | { projectId: string };

export async function addComment(input: CommentCreateInput): Promise<Comment> {
  const data = commentCreateSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    if ("taskId" in data) {
      const task = await tx.task.findUnique({ where: { id: data.taskId } });
      if (!task) throw new NotFoundError("task", data.taskId);
    } else {
      const project = await tx.project.findUnique({
        where: { id: data.projectId },
      });
      if (!project) throw new NotFoundError("project", data.projectId);
    }
    const comment = await tx.comment.create({ data });
    await logEvent(tx, "comment", comment.id, "comment.created", {
      targetType: "taskId" in data ? "task" : "project",
      targetId: "taskId" in data ? data.taskId : data.projectId,
    });
    return comment;
  });
}

export async function listComments(target: CommentTarget): Promise<Comment[]> {
  return prisma.comment.findMany({
    where: target,
    orderBy: { createdAt: "asc" },
  });
}

export async function deleteComment(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.comment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("comment", id);
    await logEvent(tx, "comment", id, "comment.deleted", {
      targetType: existing.taskId !== null ? "task" : "project",
      targetId: existing.taskId ?? existing.projectId,
    });
    await tx.comment.delete({ where: { id } });
  });
}
