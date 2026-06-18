"use client";

import { Drawer } from "vaul";

import { SetForm } from "@/components/lifting/set-form";

/** The exercise + prefill a planned card hands to the logging sheet. */
export interface SheetTarget {
  exerciseId: string;
  exerciseName: string;
  /** targetWeightKg ?? last actual — the form falls back to last-time when absent. */
  seedWeightKg?: number;
  repHint?: { repMin: number | null; repMax: number | null };
}

/**
 * The session's set-logging sheet: the same <SetForm> as the ad-hoc flow, but
 * opened straight onto one exercise (no picker) and prefilled from its plan. The
 * sheet stays open after each submit (SetForm keeps its values), so logging set
 * 2 and 3 is a single tap. `target` is retained while the drawer animates closed.
 */
export function SessionSetSheet({
  open,
  target,
  onOpenChange,
  day,
  sessionId,
}: {
  open: boolean;
  target: SheetTarget | null;
  onOpenChange: (open: boolean) => void;
  day: string;
  sessionId: string;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Drawer.Content
          className="bg-card fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[90dvh] flex-col rounded-t-2xl border-t outline-none"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full" />
          <div className="mx-auto w-full max-w-md p-4">
            <Drawer.Title className="sr-only">Log a set</Drawer.Title>
            <Drawer.Description className="sr-only">
              Log sets for the planned exercise.
            </Drawer.Description>
            {target && (
              <SetForm
                key={target.exerciseId}
                exercise={{ id: target.exerciseId, name: target.exerciseName }}
                day={day}
                sessionId={sessionId}
                seedWeightKg={target.seedWeightKg}
                repHint={target.repHint}
                onBack={() => onOpenChange(false)}
              />
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
