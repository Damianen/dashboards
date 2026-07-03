"use client";

import { useState } from "react";
import { ChevronLeft, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { useFoodDialogDirty } from "@/components/food/food-dialog";
import { ScanTab } from "@/components/food/scan-tab";
import { SearchTab } from "@/components/food/search-tab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import type { PickedItem } from "@/lib/food";
import { useBarcodeLookup } from "@/lib/hooks/use-barcode-lookup";
import { useCustomFoods } from "@/lib/hooks/use-custom-foods";
import { useMeals } from "@/lib/hooks/use-meals";

export type PickerTab = "search" | "scan" | "saved" | "manual" | "meal";

const TAB_LABELS: Record<PickerTab, string> = {
  search: "Search",
  scan: "Scan",
  saved: "Saved",
  manual: "Manual",
  meal: "Meal",
};

/**
 * The shared "add an item" step of the meal and daily-plan builders. Each tab
 * resolves to a PickedItem — an OFF product (search/scan → product lookup), a
 * saved custom food, a saved meal, or (when the "manual" tab is offered) a
 * free-typed item — and hands it back via onPick; the caller converts it to its
 * own builder-item shape. Per-builder copy (title, meal-tab hint/empty state,
 * 404 toast) comes in as props so the two flows read exactly as before.
 */
export function FoodItemPicker({
  title,
  tabs,
  onPick,
  onCancel,
  excludeMealId,
  tabsAriaLabel,
  mealTabHint,
  mealTabEmpty,
  productNotFoundMessage,
}: {
  title: string;
  tabs: readonly PickerTab[];
  onPick: (item: PickedItem) => void;
  onCancel: () => void;
  /** Hide the meal being edited from the Meal tab (nesting a meal in itself). */
  excludeMealId?: string;
  /** Accessible label for the tab strip (e.g. "Ingredient source"). */
  tabsAriaLabel: string;
  /** Muted explainer copy above the Meal tab's list. */
  mealTabHint: string;
  /** Empty-state copy for the Meal tab's list. */
  mealTabEmpty: string;
  /** Toast copy when a barcode isn't in OFF (guidance differs per builder). */
  productNotFoundMessage: string;
}) {
  const [tab, setTab] = useState<PickerTab>(tabs[0] ?? "search");
  const { looking, lookup } = useBarcodeLookup({
    onFound: (product) => onPick({ kind: "product", product }),
    onNotFound: () => toast.error(productNotFoundMessage),
  });

  const options: SegmentedOption<PickerTab>[] = tabs.map((t) => ({
    value: t,
    label: TAB_LABELS[t],
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Back"
          className="hover:bg-accent flex size-9 shrink-0 items-center justify-center rounded-md transition-colors"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>

      {!looking && (
        <Segmented<PickerTab>
          value={tab}
          onChange={setTab}
          options={options}
          size="sm"
          ariaLabel={tabsAriaLabel}
        />
      )}

      {looking ? (
        <div className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Looking up product…
        </div>
      ) : tab === "search" ? (
        <SearchTab onBarcode={lookup} />
      ) : tab === "scan" ? (
        <ScanTab active onBarcode={lookup} />
      ) : tab === "saved" ? (
        <SavedFoodList onPick={onPick} />
      ) : tab === "manual" ? (
        <ManualItemForm onPick={onPick} />
      ) : (
        <MealList
          onPick={onPick}
          excludeMealId={excludeMealId}
          hint={mealTabHint}
          empty={mealTabEmpty}
        />
      )}
    </div>
  );
}

function SavedFoodList({ onPick }: { onPick: (item: PickedItem) => void }) {
  const [query, setQuery] = useState("");
  const { data, isFetching, isError } = useCustomFoods(query);
  const results = data ?? [];

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search saved foods"
          aria-label="Search saved foods"
          className="h-11 pl-9"
        />
      </div>
      <div className="max-h-[50dvh] space-y-1 overflow-y-auto">
        {isFetching ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))
        ) : isError ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Couldn&apos;t load saved foods.
          </p>
        ) : results.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No saved foods.
          </p>
        ) : (
          results.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onPick({ kind: "customFood", food: f })}
              className="hover:bg-accent flex min-h-12 w-full items-center justify-between rounded-md px-2 py-2 text-left transition-colors"
            >
              <span className="truncate font-medium">{f.name}</span>
              {f.brand && (
                <span className="text-muted-foreground ml-2 shrink-0 truncate text-xs">
                  {f.brand}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function ManualItemForm({ onPick }: { onPick: (item: PickedItem) => void }) {
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carb, setCarb] = useState("");
  const [fat, setFat] = useState("");
  const [caffeine, setCaffeine] = useState("");
  useFoodDialogDirty(
    [name, kcal, protein, carb, fat, caffeine].some((v) => v.trim() !== ""),
  );

  function submit() {
    if (name.trim() === "" || kcal.trim() === "" || Number.isNaN(Number(kcal))) {
      toast.error("Enter a name and calories");
      return;
    }
    onPick({
      kind: "manual",
      name: name.trim(),
      macros: {
        kcal: Number(kcal),
        proteinG: protein.trim() === "" ? null : Number(protein),
        carbG: carb.trim() === "" ? null : Number(carb),
        fatG: fat.trim() === "" ? null : Number(fat),
        fiberG: null,
        sugarG: null,
        saltG: null,
        caffeineMg: caffeine.trim() === "" ? null : Number(caffeine),
      },
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="mi-name">Name</Label>
        <Input
          id="mi-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Olive oil, 1 tbsp"
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="mi-kcal">Calories (kcal)</Label>
        <Input
          id="mi-kcal"
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
          <Label htmlFor="mi-protein">Protein (g)</Label>
          <Input
            id="mi-protein"
            type="number"
            inputMode="decimal"
            min={0}
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            placeholder="opt."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mi-carb">Carbs (g)</Label>
          <Input
            id="mi-carb"
            type="number"
            inputMode="decimal"
            min={0}
            value={carb}
            onChange={(e) => setCarb(e.target.value)}
            placeholder="opt."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mi-fat">Fat (g)</Label>
          <Input
            id="mi-fat"
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
        <Label htmlFor="mi-caffeine">Caffeine (mg)</Label>
        <Input
          id="mi-caffeine"
          type="number"
          inputMode="decimal"
          min={0}
          value={caffeine}
          onChange={(e) => setCaffeine(e.target.value)}
          placeholder="opt."
        />
      </div>
      <Button type="button" className="h-11 w-full" onClick={submit}>
        Add ingredient
      </Button>
    </div>
  );
}

function MealList({
  onPick,
  excludeMealId,
  hint,
  empty,
}: {
  onPick: (item: PickedItem) => void;
  excludeMealId?: string;
  hint: string;
  empty: string;
}) {
  const { data, isLoading, isError } = useMeals();
  const meals = (data ?? []).filter((m) => m.id !== excludeMealId);

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">{hint}</p>
      <div className="max-h-[50dvh] space-y-1 overflow-y-auto">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))
        ) : isError ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Couldn&apos;t load meals.
          </p>
        ) : meals.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            {empty}
          </p>
        ) : (
          meals.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onPick({ kind: "meal", meal: m })}
              className="hover:bg-accent flex min-h-12 w-full items-center justify-between rounded-md px-2 py-2 text-left transition-colors"
            >
              <span className="truncate font-medium">{m.name}</span>
              <span className="text-muted-foreground ml-2 shrink-0 text-xs tabular-nums">
                {m.perPortionKcal ?? 0} kcal/portion
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
