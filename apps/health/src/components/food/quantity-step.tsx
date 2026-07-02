"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";

import { MealPicker } from "@/components/food/meal-picker";
import { PreviewStat } from "@/components/food/preview-stat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stepper } from "@/components/ui/stepper";
import { type LoggableItem, suggestMeal } from "@/lib/food";
import { formatNumber } from "@/lib/format";
import { useLogFood } from "@/lib/hooks/use-log-food";
import { scaleMacros } from "@/lib/rules";
import type { LogFoodInput } from "@/lib/schemas/food";

/**
 * The grams step a scan/search/label-scan converges on: pick a portion, preview the
 * scaled macros live (reusing scaleMacros — the same math the server snapshots), pick
 * a meal, confirm. Confirm logs via useLogFood with an optimistic preview row. Works
 * for any LoggableItem — `ref` decides whether the entry resolves by barcode or by
 * saved custom food id.
 */
export function QuantityStep({
  item,
  day,
  initialGrams,
  onBack,
  onLogged,
}: {
  item: LoggableItem;
  day: string;
  /** Prefill (e.g. a recent entry's last-used amount); falls back to serving/100 g. */
  initialGrams?: number;
  onBack: () => void;
  onLogged: () => void;
}) {
  const servingG = item.servingG;
  const [grams, setGrams] = useState(
    initialGrams ?? (servingG && servingG > 0 ? servingG : 100),
  );
  const [meal, setMeal] = useState(() => suggestMeal(new Date()));
  // null = follow the live scaled prefill; a string = the user has overridden it.
  const [caffeineInput, setCaffeineInput] = useState<string | null>(null);
  const { mutate, isPending } = useLogFood(day);

  const scaled = scaleMacros(item.per100g, grams);
  const macros = {
    kcal: scaled.kcal ?? 0,
    proteinG: scaled.proteinG ?? 0,
    carbG: scaled.carbG ?? 0,
    fatG: scaled.fatG ?? 0,
  };
  // Caffeine (mg) for this portion: prefilled from the product/custom food (scaled to
  // grams) when known, always editable. Tracks the grams stepper until the user edits.
  const caffeineValue =
    caffeineInput ?? (scaled.caffeineMg != null ? String(scaled.caffeineMg) : "");

  const presets: { label: string; grams: number }[] = [
    { label: "30 g", grams: 30 },
    { label: "50 g", grams: 50 },
    { label: "100 g", grams: 100 },
  ];
  if (servingG && servingG > 0) {
    presets.push({ label: `1 serving`, grams: servingG });
  }

  function confirm() {
    const source: Pick<LogFoodInput, "barcode" | "customFoodId"> =
      item.ref.kind === "barcode"
        ? { barcode: item.ref.barcode }
        : { customFoodId: item.ref.customFoodId };
    // Empty field: clear to 0 if the source carried caffeine (explicit removal),
    // else omit entirely. A number overrides the snapshot.
    const raw = caffeineValue.trim();
    const caffeineMg =
      raw === ""
        ? item.per100g.caffeineMg != null
          ? 0
          : undefined
        : Number(raw);
    mutate(
      {
        input: {
          ...source,
          quantityG: grams,
          meal,
          ...(caffeineMg !== undefined ? { caffeineMg } : {}),
        },
        preview: {
          displayName: item.name,
          imageUrl: item.imageUrl,
          quantityG: grams,
          meal,
          macros,
        },
      },
      { onSuccess: onLogged },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="hover:bg-accent flex size-9 shrink-0 items-center justify-center rounded-md transition-colors"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{item.name}</h2>
          {item.brand && (
            <p className="text-muted-foreground truncate text-xs">
              {item.brand}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="food-grams">Amount (g)</Label>
        <Stepper
          id="food-grams"
          label="grams"
          value={grams}
          onChange={setGrams}
          step={10}
          min={1}
          max={5000}
        />
        <div className="flex flex-wrap gap-2 pt-1">
          {presets.map((p) => (
            <Button
              key={p.label}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setGrams(p.grams)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="bg-muted grid grid-cols-4 gap-2 rounded-lg p-3">
        <PreviewStat value={formatNumber(macros.kcal)} label="kcal" />
        <PreviewStat value={`${formatNumber(macros.proteinG, 1)}g`} label="protein" />
        <PreviewStat value={`${formatNumber(macros.carbG, 1)}g`} label="carbs" />
        <PreviewStat value={`${formatNumber(macros.fatG, 1)}g`} label="fat" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="food-caffeine">Caffeine (mg)</Label>
        <Input
          id="food-caffeine"
          type="number"
          inputMode="decimal"
          min={0}
          value={caffeineValue}
          onChange={(e) => setCaffeineInput(e.target.value)}
          placeholder="opt."
        />
        <p className="text-muted-foreground text-[10px]">
          Raises today&apos;s caffeine total and water target.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Meal</Label>
        <MealPicker value={meal} onChange={setMeal} />
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
