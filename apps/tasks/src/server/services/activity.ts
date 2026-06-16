// The single ActivityEvent write path. Every service mutation calls logEvent
// inside its transaction so the event commits atomically with the change.

import type { Prisma } from "@/generated/prisma/client";

export type Tx = Prisma.TransactionClient;

export type EntityType =
  | "project"
  | "section"
  | "task"
  | "label"
  | "comment"
  | "reminder";

export async function logEvent(
  tx: Tx,
  entityType: EntityType,
  entityId: string,
  action: string,
  payload?: Prisma.InputJsonValue,
): Promise<void> {
  await tx.activityEvent.create({
    data: { entityType, entityId, action, payload },
  });
}
