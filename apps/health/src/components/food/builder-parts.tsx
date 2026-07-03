"use client";

import { X } from "lucide-react";

import { Stepper } from "@/components/ui/stepper";
import { formatNumber } from "@/lib/format";

/** One cell of a builder sheet's macro-summary grid (value over tiny label). */
export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="font-semibold tabular-nums">{value}</div>
      <div className="text-muted-foreground text-[10px] uppercase">{label}</div>
    </div>
  );
}

/**
 * One item row of a builder sheet: name + kcal contribution + remove, with an
 * amount Stepper configured by `unit` (grams: ±10, 1–5000; portions: ±0.5,
 * 0.5–9999). `stepper={false}` hides it (the meal builder's free-typed items,
 * whose macros are absolute). Extra per-builder controls (the plan builder's
 * slot picker) render below via `children`.
 */
export function BuilderItemRow({
  name,
  kcal,
  amount,
  unit,
  onAmount,
  onRemove,
  stepper = true,
  children,
}: {
  name: string;
  kcal: number;
  amount: number;
  unit: "grams" | "portions";
  onAmount: (n: number) => void;
  onRemove: () => void;
  stepper?: boolean;
  children?: React.ReactNode;
}) {
  const isPortions = unit === "portions";

  return (
    <li className="bg-background space-y-2 rounded-md border p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{name}</div>
          <div className="text-muted-foreground text-xs tabular-nums">
            {formatNumber(kcal)} kcal
          </div>
        </div>
        <button
          type="button"
          aria-label={`Remove ${name}`}
          onClick={onRemove}
          className="hover:bg-accent flex size-8 shrink-0 items-center justify-center rounded-md transition-colors"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {stepper && (
        <Stepper
          label={isPortions ? "portions" : "grams"}
          value={amount}
          onChange={onAmount}
          step={isPortions ? 0.5 : 10}
          min={isPortions ? 0.5 : 1}
          max={isPortions ? 9999 : 5000}
          inputMode="decimal"
        />
      )}
      {children}
    </li>
  );
}
