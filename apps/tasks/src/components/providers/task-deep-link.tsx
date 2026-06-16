"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import * as React from "react";

import { getTaskAction } from "@/server/actions/tasks";
import type { TaskWithLabels } from "@/server/services/tasks";

/**
 * Opens a task's detail sheet from a `?task=<id>` query param (the ntfy
 * reminder click target). Fetches the task, then strips the param so the same
 * task can be re-opened later. Rendered inside SheetProvider; wrap in Suspense
 * since it reads search params.
 */
export function TaskDeepLink({
  onOpen,
}: {
  onOpen: (task: TaskWithLabels) => void;
}): null {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const taskId = params.get("task");
  const handled = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!taskId || handled.current === taskId) return;
    handled.current = taskId;
    let cancelled = false;
    void (async () => {
      const result = await getTaskAction(taskId);
      if (cancelled) return;
      router.replace(pathname, { scroll: false });
      if (result.ok) onOpen(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId, pathname, router, onOpen]);

  return null;
}
