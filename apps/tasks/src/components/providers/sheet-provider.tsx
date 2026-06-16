"use client";

import * as React from "react";

import { KeyboardShortcuts } from "@/components/providers/keyboard-shortcuts";
import { TaskDeepLink } from "@/components/providers/task-deep-link";
import { QuickAddSheet } from "@/components/sheets/quick-add-sheet";
import { RescheduleSheet } from "@/components/sheets/reschedule-sheet";
import { TaskDetailSheet } from "@/components/sheets/task-detail-sheet";
import type { TaskWithLabels } from "@/server/services/tasks";

interface SheetsContextValue {
  openTaskDetail: (task: TaskWithLabels) => void;
  openQuickAdd: () => void;
  openReschedule: (task: TaskWithLabels) => void;
}

const SheetsContext = React.createContext<SheetsContextValue | null>(null);

export function useSheets(): SheetsContextValue {
  const ctx = React.useContext(SheetsContext);
  if (!ctx) throw new Error("useSheets must be used within a SheetProvider");
  return ctx;
}

/** Mounts the task-detail and quick-add sheets once and exposes openers. */
export function SheetProvider({ children }: { children: React.ReactNode }) {
  const [detailTask, setDetailTask] = React.useState<TaskWithLabels | null>(
    null,
  );
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [quickAddOpen, setQuickAddOpen] = React.useState(false);
  const [rescheduleTask, setRescheduleTask] =
    React.useState<TaskWithLabels | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = React.useState(false);

  const value = React.useMemo<SheetsContextValue>(
    () => ({
      openTaskDetail: (task) => {
        setDetailTask(task);
        setDetailOpen(true);
      },
      openQuickAdd: () => setQuickAddOpen(true),
      openReschedule: (task) => {
        setRescheduleTask(task);
        setRescheduleOpen(true);
      },
    }),
    [],
  );

  return (
    <SheetsContext.Provider value={value}>
      {children}
      <TaskDetailSheet
        task={detailTask}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
      <QuickAddSheet open={quickAddOpen} onOpenChange={setQuickAddOpen} />
      <RescheduleSheet
        task={rescheduleTask}
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
      />
      <React.Suspense fallback={null}>
        <TaskDeepLink onOpen={value.openTaskDetail} />
      </React.Suspense>
      <KeyboardShortcuts onQuickAdd={() => setQuickAddOpen(true)} />
    </SheetsContext.Provider>
  );
}
