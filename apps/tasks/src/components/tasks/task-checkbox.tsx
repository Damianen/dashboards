"use client";

import { m, useReducedMotion } from "motion/react";

import { priorityTextClass } from "@/lib/priority";
import { cn } from "@/lib/utils";

/**
 * The hero interaction: a 44px tap target around a size-5 circle stroked in
 * the task's priority colour. Checking it draws the tick (pathLength 0→1) and
 * springs the circle. Presentational — the parent owns completion timing.
 */
export function TaskCheckbox({
  checked,
  priority,
  onToggle,
  title,
}: {
  checked: boolean;
  priority: number;
  onToggle: () => void;
  title: string;
}) {
  const reduce = useReducedMotion();

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? `Reopen ${title}` : `Complete ${title}`}
      onClick={onToggle}
      className={cn(
        "-m-3 flex size-11 shrink-0 items-center justify-center p-3",
        priorityTextClass(priority),
      )}
    >
      <m.span
        initial={false}
        animate={reduce ? undefined : { scale: checked ? [1, 0.85, 1.05, 1] : 1 }}
        transition={{ duration: 0.3, times: [0, 0.3, 0.7, 1] }}
        className={cn(
          "flex size-5 items-center justify-center rounded-full border-2 border-current transition-colors",
          checked ? "bg-current" : "bg-current/10",
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3 text-background"
          aria-hidden
        >
          <m.path
            d="M5 13l4 4L19 7"
            initial={false}
            animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
          />
        </svg>
      </m.span>
    </button>
  );
}
