"use client";

import { useEffect, useRef } from "react";
import { Minus, Plus } from "lucide-react";

import { clampStep } from "@/lib/lifting-grouping";
import { cn } from "@/lib/utils";

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** Delay before a held button starts repeating. */
  fastStepDelayMs?: number;
  /** Repeat interval once fast-step kicks in. */
  fastStepIntervalMs?: number;
  inputMode?: "numeric" | "decimal";
  /** Used for the input + button aria-labels (e.g. "reps", "weight"). */
  label: string;
  id?: string;
  className?: string;
}

/**
 * A −/＋ number stepper. Tap = one step; press-and-hold = fast repeat. The repeat
 * reads the live value through a ref so it never steps off a stale closure, and
 * all timers are cleared on pointer up/leave/cancel and unmount. The input is
 * uncontrolled and re-keyed on external value changes so decimals stay typeable.
 * Controls are ≥44px for touch.
 */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  fastStepDelayMs = 400,
  fastStepIntervalMs = 80,
  inputMode = "numeric",
  label,
  id,
  className,
}: StepperProps) {
  // Keep the latest value reachable from the hold-repeat timer.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const timers = useRef<{
    timeout?: ReturnType<typeof setTimeout>;
    interval?: ReturnType<typeof setInterval>;
  }>({});

  function endHold() {
    if (timers.current.timeout) clearTimeout(timers.current.timeout);
    if (timers.current.interval) clearInterval(timers.current.interval);
    timers.current = {};
  }

  function startHold(e: React.PointerEvent<HTMLButtonElement>, dir: 1 | -1) {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const bump = () =>
      onChange(clampStep(valueRef.current, dir, step, min, max));
    bump(); // immediate single step on tap
    timers.current.timeout = setTimeout(() => {
      timers.current.interval = setInterval(bump, fastStepIntervalMs);
    }, fastStepDelayMs);
  }

  // Clear any running timer if the stepper unmounts mid-hold.
  useEffect(() => endHold, []);

  const btn =
    "border-input flex size-11 shrink-0 items-center justify-center rounded-md border bg-transparent shadow-xs transition-colors hover:bg-accent active:scale-95 disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className={cn("flex items-stretch gap-2", className)}>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onPointerDown={(e) => startHold(e, -1)}
        onPointerUp={() => endHold()}
        onPointerLeave={() => endHold()}
        onPointerCancel={() => endHold()}
        onContextMenu={(e) => e.preventDefault()}
        style={{ touchAction: "manipulation" }}
        className={btn}
      >
        <Minus className="size-5" aria-hidden />
      </button>
      <input
        // Re-mount on external value changes (buttons, seeding) so the displayed
        // text follows; while typing, value rarely changes so decimals survive.
        key={value}
        id={id}
        aria-label={label}
        inputMode={inputMode}
        type="text"
        defaultValue={String(value)}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value !== "" && !Number.isNaN(n)) {
            onChange(Math.min(max, Math.max(min, n)));
          }
        }}
        onBlur={(e) => {
          if (
            e.currentTarget.value === "" ||
            Number.isNaN(Number(e.currentTarget.value))
          ) {
            e.currentTarget.value = String(value);
          }
        }}
        className="border-input h-11 w-full min-w-0 rounded-md border bg-transparent text-center text-lg font-semibold tabular-nums shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
      />
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onPointerDown={(e) => startHold(e, 1)}
        onPointerUp={() => endHold()}
        onPointerLeave={() => endHold()}
        onPointerCancel={() => endHold()}
        onContextMenu={(e) => e.preventDefault()}
        style={{ touchAction: "manipulation" }}
        className={btn}
      >
        <Plus className="size-5" aria-hidden />
      </button>
    </div>
  );
}
