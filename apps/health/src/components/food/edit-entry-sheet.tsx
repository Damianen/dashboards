"use client";

import { useState } from "react";

import { MealPicker } from "@/components/food/meal-picker";
import { PreviewStat } from "@/components/food/preview-stat";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Stepper } from "@/components/ui/stepper";
import {
  type EntryTotals,
  type FoodEntryView,
  type MealSlot,
  rescaleEntryTotals,
  suggestMeal,
} from "@/lib/food";
import { formatNumber } from "@/lib/format";
import { useUpdateFoodEntry } from "@/lib/hooks/use-update-food-entry";
import type { UpdateFoodEntryInput } from "@/lib/schemas/food";

/**
 * Tap-a-diary-row editor. Quantity edits rescale the entry's OWN logged macros
 * (per-unit = totals ÷ stored quantity — the same snapshot math the server
 * applies); the product cache is never consulted. Portion-based (meal-logged)
 * and free-form entries keep their macros and only re-slot the meal.
 */
export function EditEntrySheet({
  entry,
  day,
  open,
  onOpenChange,
}: {
  entry: FoodEntryView | null;
  day: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Edit entry"
      description="Adjust the quantity or meal of a logged entry."
      showTitle
      titleClassName="text-base font-semibold"
      bodyClassName="space-y-4"
    >
      {entry && (
        <EditEntryBody
          key={entry.id}
          entry={entry}
          day={day}
          onDone={() => onOpenChange(false)}
        />
      )}
    </BottomSheet>
  );
}

function entryTotals(entry: FoodEntryView): EntryTotals {
  return {
    kcal: entry.kcal,
    proteinG: entry.proteinG,
    carbG: entry.carbG,
    fatG: entry.fatG,
    fiberG: null,
    sugarG: null,
    saltG: null,
    caffeineMg: null,
  };
}

function EditEntryBody({
  entry,
  day,
  onDone,
}: {
  entry: FoodEntryView;
  day: string;
  onDone: () => void;
}) {
  // Gram entries rescale linearly from their own totals. Portion entries
  // (meal-logged) have no gram basis, and free-form entries store absolute
  // macros against an arbitrary quantity — both keep their macros untouched.
  const canEditQuantity =
    entry.quantityG != null && entry.portions == null && !entry.isCustom;

  const [grams, setGrams] = useState(entry.quantityG ?? 100);
  const [meal, setMeal] = useState<MealSlot>(
    entry.meal ?? suggestMeal(new Date()),
  );
  // Only a picker the user actually touched goes into the PATCH — an untouched
  // "Other" (meal null) entry must stay unslotted.
  const [mealTouched, setMealTouched] = useState(false);
  const { mutate, isPending } = useUpdateFoodEntry(day);

  const preview =
    canEditQuantity && entry.quantityG != null
      ? rescaleEntryTotals(entryTotals(entry), entry.quantityG, grams)
      : entryTotals(entry);

  const quantityChanged = canEditQuantity && grams !== entry.quantityG;
  const mealChanged = mealTouched && meal !== entry.meal;
  const dirty = quantityChanged || mealChanged;

  function save() {
    const input: UpdateFoodEntryInput = {
      ...(quantityChanged ? { quantityG: grams } : {}),
      ...(mealChanged ? { meal } : {}),
    };
    mutate({ entry, input }, { onSuccess: onDone });
  }

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold">
          {entry.displayName}
        </h3>
        {entry.portions != null && (
          <p className="text-muted-foreground text-xs tabular-nums">
            {formatNumber(entry.portions, 2)}{" "}
            {entry.portions === 1 ? "portion" : "portions"} — macros stay as
            logged
          </p>
        )}
      </div>

      {canEditQuantity && (
        <div className="space-y-1.5">
          <Label htmlFor="edit-entry-grams">Amount (g)</Label>
          <Stepper
            id="edit-entry-grams"
            label="grams"
            value={grams}
            onChange={setGrams}
            step={10}
            min={1}
            max={5000}
          />
        </div>
      )}

      <div className="bg-muted grid grid-cols-4 gap-2 rounded-lg p-3">
        <PreviewStat value={formatNumber(preview.kcal)} label="kcal" />
        <PreviewStat
          value={`${formatNumber(preview.proteinG, 1)}g`}
          label="protein"
        />
        <PreviewStat
          value={`${formatNumber(preview.carbG, 1)}g`}
          label="carbs"
        />
        <PreviewStat value={`${formatNumber(preview.fatG, 1)}g`} label="fat" />
      </div>

      <div className="space-y-1.5">
        <Label>Meal</Label>
        <MealPicker
          value={meal}
          onChange={(m) => {
            setMealTouched(true);
            setMeal(m);
          }}
        />
      </div>

      <Button
        type="button"
        className="h-12 w-full text-base"
        onClick={save}
        disabled={!dirty || isPending}
      >
        Save changes
      </Button>
    </div>
  );
}
