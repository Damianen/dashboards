"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

import { clampStep, parseStepperInput } from "@/lib/lifting-grouping";
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
 * controlled by a local text buffer that only re-syncs from `value` while it isn't
 * being edited — so decimals (incl. the Europe/Amsterdam comma) and multi-digit
 * entry stay typeable without the field remounting or dropping focus mid-edit.
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

  // Local text buffer so partial/decimal entries ("62.", "62,5") survive while typing.
  const [text, setText] = useState(String(value));
  const focusedRef = useRef(false);
  // Re-sync the displayed text from `value` only when the field isn't being edited,
  // so button steps / seeding / suggestions update it but typing is never clobbered.
  useEffect(() => {
    if (!focusedRef.current) setText(String(value));
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
    const bump = () => {
      const next = clampStep(valueRef.current, dir, step, min, max);
      onChange(next);
      // Reflect the step in the field even when it currently holds focus (the
      // value-sync effect skips while focused).
      setText(String(next));
    };
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
        id={id}
        aria-label={label}
        inputMode={inputMode}
        type="text"
        value={text}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw); // keep partial entries ("62.", "62,5") on screen
          const parsed = parseStepperInput(raw, step, min, max);
          if (parsed !== null) onChange(parsed);
        }}
        onBlur={(e) => {
          focusedRef.current = false;
          const parsed = parseStepperInput(e.currentTarget.value, step, min, max);
          if (parsed === null) {
            setText(String(value)); // revert empty/garbage to the last good value
          } else {
            onChange(parsed);
            setText(String(parsed)); // normalise "62," → "62.5", "62.55" → "62.6"
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
