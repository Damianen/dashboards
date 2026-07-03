"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";

import { useFoodDialogDirty } from "@/components/food/food-dialog";
import { MealPicker } from "@/components/food/meal-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Stepper } from "@/components/ui/stepper";
import { suggestMeal } from "@/lib/food";
import { formatNumber } from "@/lib/format";
import { useLogMeal } from "@/lib/hooks/use-log-meal";
import { scaleMacrosBy } from "@/lib/meals";
import type { MealSummary } from "@/server/services/meals";

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="font-semibold tabular-nums">{value}</div>
      <div className="text-muted-foreground text-[10px] uppercase">{label}</div>
    </div>
  );
}

/**
 * Inline meal-log step: a fractional portion stepper (default 1) with a live macro
 * preview (per-portion × portions — the same math the server snapshots), a meal-slot
 * picker, and a confirm that logs one combined diary entry via useLogMeal. Used both in
 * the meal log sheet and as the Add-food sheet's "Meals" tab.
 */
export function MealLogStep({
  meal,
  day,
  onLogged,
  onBack,
}: {
  meal: MealSummary;
  day: string;
  onLogged: () => void;
  onBack?: () => void;
}) {
  const [portions, setPortions] = useState(1);
  // Seeded once so dirtiness can compare against the suggestion the user saw.
  const [initialSlot] = useState(() => suggestMeal(new Date()));
  const [slot, setSlot] = useState(initialSlot);
  const { mutate, isPending } = useLogMeal(day);
  useFoodDialogDirty(portions !== 1 || slot !== initialSlot);

  const scaled = scaleMacrosBy(meal.perPortion, portions);
  const macros = {
    kcal: scaled.kcal ?? 0,
    proteinG: scaled.proteinG ?? 0,
    carbG: scaled.carbG ?? 0,
    fatG: scaled.fatG ?? 0,
  };

  function confirm() {
    mutate(
      { mealId: meal.id, portions, meal: slot, name: meal.name, macros },
      { onSuccess: onLogged },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="hover:bg-accent flex size-9 shrink-0 items-center justify-center rounded-md transition-colors"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{meal.name}</h2>
          <p className="text-muted-foreground truncate text-xs">
            {formatNumber(meal.perPortionKcal ?? 0)} kcal per portion ·{" "}
            {formatNumber(meal.yieldPortions, 2)} per recipe
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="meal-portions">Portions</Label>
        <Stepper
          id="meal-portions"
          label="portions"
          value={portions}
          onChange={setPortions}
          step={0.5}
          min={0.5}
          max={9999}
          inputMode="decimal"
        />
      </div>

      <div className="bg-muted grid grid-cols-4 gap-2 rounded-lg p-3">
        <Stat value={formatNumber(macros.kcal)} label="kcal" />
        <Stat value={`${formatNumber(macros.proteinG, 1)}g`} label="protein" />
        <Stat value={`${formatNumber(macros.carbG, 1)}g`} label="carbs" />
        <Stat value={`${formatNumber(macros.fatG, 1)}g`} label="fat" />
      </div>

      <div className="space-y-1.5">
        <Label>Meal</Label>
        <MealPicker value={slot} onChange={setSlot} />
      </div>

      <Button
        type="button"
        className="h-12 w-full text-base"
        onClick={confirm}
        disabled={isPending}
      >
        Add to diary
      </Button>
    </div>
  );
}
