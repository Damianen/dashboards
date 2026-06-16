// ntfy push helper. Publishes to NTFY_URL using JSON (so UTF-8 task titles
// survive), with the task title as the notification title and a click action
// that deep-links to the task. A no-op (logged) when NTFY_URL / NTFY_TOPIC are
// unset, so dev and tests never fail on a missing notification target.

import type { Task } from "@/generated/prisma/client";
import { formatDueChip } from "@/lib/dates";

export async function sendTaskReminder(task: Task): Promise<void> {
  const base = process.env.NTFY_URL?.replace(/\/$/, "");
  const topic = process.env.NTFY_TOPIC;
  if (!base || !topic) {
    console.warn(`[ntfy] skipped (NTFY_URL/NTFY_TOPIC unset): ${task.title}`);
    return;
  }

  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  const message = task.dueAt
    ? `Due ${formatDueChip(task.dueAt, task.hasDueTime, task.timezone)}`
    : "Reminder";
  const payload: Record<string, unknown> = {
    topic,
    title: task.title,
    message,
  };
  if (appUrl) payload.click = `${appUrl}/today?task=${task.id}`;

  const res = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok)
    throw new Error(`ntfy publish failed: ${res.status} ${res.statusText}`);
}
