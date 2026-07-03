"use client";

import { useState } from "react";
import { toast } from "sonner";

import { useFoodDialogDirty } from "@/components/food/food-dialog";
import { MealPicker } from "@/components/food/meal-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { suggestMeal } from "@/lib/food";
import { useLogFood } from "@/lib/hooks/use-log-food";
import { type LogFoodInput, logFoodSchema } from "@/lib/schemas/food";

/**
 * Manually log a food by name + kcal (+ optional macros). Also the "barcode not
 * found" fallback (the name starts empty — scanned digits make a useless name).
 * quantityG is fixed to 1 (the schema requires >0; custom macros are absolute,
 * not per-100g) and the diary hides the gram count for custom rows.
 */
export function CustomTab({
  day,
  onLogged,
}: {
  day: string;
  onLogged: () => void;
}) {
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carb, setCarb] = useState("");
  const [fat, setFat] = useState("");
  const [caffeine, setCaffeine] = useState("");
  // Seeded once so dirtiness can compare against the suggestion the user saw.
  const [initialMeal] = useState(() => suggestMeal(new Date()));
  const [meal, setMeal] = useState(initialMeal);
  const { mutate, isPending } = useLogFood(day);
  useFoodDialogDirty(
    [name, kcal, protein, carb, fat, caffeine].some((v) => v.trim() !== "") ||
      meal !== initialMeal,
  );

  function submit() {
    if (name.trim() === "" || kcal.trim() === "") {
      toast.error("Enter a name and calories");
      return;
    }
    const candidate: LogFoodInput = {
      customName: name.trim(),
      quantityG: 1,
      kcal: Number(kcal),
      meal,
      ...(protein.trim() !== "" ? { proteinG: Number(protein) } : {}),
      ...(carb.trim() !== "" ? { carbG: Number(carb) } : {}),
      ...(fat.trim() !== "" ? { fatG: Number(fat) } : {}),
      ...(caffeine.trim() !== "" ? { caffeineMg: Number(caffeine) } : {}),
    };
    const parsed = logFoodSchema.safeParse(candidate);
    if (!parsed.success) {
      toast.error("Enter a name and calories");
      return;
    }
    mutate(
      {
        input: parsed.data,
        preview: {
          displayName: name.trim(),
          imageUrl: null,
          quantityG: 1,
          meal,
          macros: {
            kcal: Number(kcal),
            proteinG: protein.trim() === "" ? 0 : Number(protein),
            carbG: carb.trim() === "" ? 0 : Number(carb),
            fatG: fat.trim() === "" ? 0 : Number(fat),
          },
        },
      },
      { onSuccess: onLogged },
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="custom-name">Name</Label>
        <Input
          id="custom-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Homemade soup"
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="custom-kcal">Calories (kcal)</Label>
        <Input
          id="custom-kcal"
          type="number"
          inputMode="numeric"
          min={0}
          value={kcal}
          onChange={(e) => setKcal(e.target.value)}
          placeholder="kcal"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="custom-protein">Protein (g)</Label>
          <Input
            id="custom-protein"
            type="number"
            inputMode="decimal"
            min={0}
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            placeholder="opt."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="custom-carb">Carbs (g)</Label>
          <Input
            id="custom-carb"
            type="number"
            inputMode="decimal"
            min={0}
            value={carb}
            onChange={(e) => setCarb(e.target.value)}
            placeholder="opt."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="custom-fat">Fat (g)</Label>
          <Input
            id="custom-fat"
            type="number"
            inputMode="decimal"
            min={0}
            value={fat}
            onChange={(e) => setFat(e.target.value)}
            placeholder="opt."
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="custom-caffeine">Caffeine (mg)</Label>
        <Input
          id="custom-caffeine"
          type="number"
          inputMode="decimal"
          min={0}
          value={caffeine}
          onChange={(e) => setCaffeine(e.target.value)}
          placeholder="opt."
        />
      </div>

      <div className="space-y-1.5">
        <Label>Meal</Label>
        <MealPicker value={meal} onChange={setMeal} />
      </div>

      <Button
        type="button"
        className="h-12 w-full text-base"
        onClick={submit}
        disabled={isPending}
      >
        Add to diary
      </Button>
    </div>
  );
}
