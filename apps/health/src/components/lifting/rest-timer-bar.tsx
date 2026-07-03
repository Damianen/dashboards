"use client";

import { useEffect, useRef, useState } from "react";
import { Timer, X } from "lucide-react";

import { formatRest, remainingSec, restFraction } from "@/lib/rest-timer";
import { cn } from "@/lib/utils";

/**
 * The between-sets rest countdown, fixed just above the bottom nav (56px bar +
 * 8px gap; the trailing 4.5rem margin keeps it clear of the quick-log FAB,
 * which sits bottom-right at z-50 and would otherwise paint over it). The
 * remaining time is DERIVED from endsAt − now on every tick, so backgrounding
 * the tab or locking the phone never drifts the countdown. When it first hits
 * zero the phone buzzes once and the bar flips to a "Rest over" state that
 * persists until dismissed or replaced (the parent keys this component by
 * endsAt, so a newly logged set remounts it with fresh tick + vibration state).
 */
export function RestTimerBar({
  exerciseName,
  endsAt,
  totalSec,
  onDismiss,
}: {
  exerciseName: string;
  endsAt: number;
  totalSec: number;
  onDismiss: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  // Guards the one-shot vibration (and stops the interval once the countdown
  // is over — the remaining time can never climb back up for a fixed endsAt).
  const doneRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => {
      const nowMs = Date.now();
      setNow(nowMs);
      if (doneRef.current || remainingSec(endsAt, nowMs) > 0) return;
      doneRef.current = true;
      clearInterval(t);
      if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
    }, 500);
    return () => clearInterval(t);
  }, [endsAt]);

  const remaining = remainingSec(endsAt, now);
  const done = remaining === 0;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4rem)] z-30 mx-auto w-full max-w-md px-4">
      <div
        className={cn(
          "bg-card pointer-events-auto mr-[4.5rem] rounded-xl border p-2 pl-3 shadow-lg",
          done && "border-success",
        )}
      >
        <div className="flex items-center gap-2">
          <Timer
            className={cn(
              "size-4 shrink-0",
              done ? "text-success" : "text-muted-foreground",
            )}
            aria-hidden
          />
          <p
            role="status"
            className={cn(
              "min-w-0 flex-1 truncate text-sm font-medium",
              done && "text-success",
            )}
          >
            {done ? "Rest over" : exerciseName}
          </p>
          <span className="text-sm font-semibold tabular-nums">
            {formatRest(remaining)}
          </span>
          <button
            type="button"
            aria-label="Skip rest"
            onClick={onDismiss}
            className="hover:bg-accent text-muted-foreground -my-1 flex size-11 shrink-0 items-center justify-center rounded-md transition-colors"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="bg-muted mt-1.5 h-1 overflow-hidden rounded-full">
          <div
            className={cn("h-full rounded-full", done ? "bg-success" : "bg-primary")}
            style={{ width: `${restFraction(totalSec, remaining) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
