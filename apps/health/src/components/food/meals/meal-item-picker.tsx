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
import { getJSON, HttpError } from "@/lib/fetcher";
import { coerceMacros, type FoodProductDTO } from "@/lib/food";
import {
  type BuilderItem,
  builderKey,
} from "@/lib/meal-builder";
import { useCustomFoods } from "@/lib/hooks/use-custom-foods";
import { useMeals } from "@/lib/hooks/use-meals";

type Tab = "search" | "scan" | "saved" | "manual" | "meal";

const TABS: SegmentedOption<Tab>[] = [
  { value: "search", label: "Search" },
  { value: "scan", label: "Scan" },
  { value: "saved", label: "Saved" },
  { value: "manual", label: "Manual" },
  { value: "meal", label: "Meal" },
];

/**
 * The "add an ingredient" step of the meal builder. Each tab resolves to a BuilderItem
 * and hands it back via onAdd: an OFF product (search/scan → product lookup), a saved
 * custom food, a free-typed item, or another saved meal (nested). `excludeMealId` hides
 * the meal being edited from the nest list.
 */
export function MealItemPicker({
  onAdd,
  onCancel,
  excludeMealId,
}: {
  onAdd: (item: BuilderItem) => void;
  onCancel: () => void;
  excludeMealId?: string;
}) {
  const [tab, setTab] = useState<Tab>("search");
  const [looking, setLooking] = useState(false);

  async function handleBarcode(barcode: string) {
    setLooking(true);
    try {
      const product = await getJSON<FoodProductDTO>(
        `/api/food/products/${encodeURIComponent(barcode)}`,
      );
      onAdd({
        key: builderKey(),
        name: product.name,
        amount:
          product.servingG != null && Number(product.servingG) > 0
            ? Number(product.servingG)
            : 100,
        source: { kind: "product", barcode: product.barcode, per100g: product.per100g },
      });
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        toast.error("Product not found — try the Manual tab");
      } else {
        toast.error("Couldn't look up that barcode");
      }
    } finally {
      setLooking(false);
    }
  }

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
        <h2 className="text-base font-semibold">Add ingredient</h2>
      </div>

      {!looking && (
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={TABS}
          size="sm"
          ariaLabel="Ingredient source"
        />
      )}

      {looking ? (
        <div className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Looking up product…
        </div>
      ) : tab === "search" ? (
        <SearchTab onBarcode={handleBarcode} />
      ) : tab === "scan" ? (
        <ScanTab active onBarcode={handleBarcode} />
      ) : tab === "saved" ? (
        <SavedFoodPicker onAdd={onAdd} />
      ) : tab === "manual" ? (
        <ManualItemForm onAdd={onAdd} />
      ) : (
        <NestedMealPicker onAdd={onAdd} excludeMealId={excludeMealId} />
      )}
    </div>
  );
}

function SavedFoodPicker({ onAdd }: { onAdd: (item: BuilderItem) => void }) {
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
              onClick={() =>
                onAdd({
                  key: builderKey(),
                  name: f.name,
                  amount:
                    f.servingG != null && Number(f.servingG) > 0
                      ? Number(f.servingG)
                      : 100,
                  source: {
                    kind: "customFood",
                    customFoodId: f.id,
                    per100g: coerceMacros(f.per100g),
                  },
                })
              }
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

function ManualItemForm({ onAdd }: { onAdd: (item: BuilderItem) => void }) {
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
    onAdd({
      key: builderKey(),
      name: name.trim(),
      amount: 0,
      source: {
        kind: "free",
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

function NestedMealPicker({
  onAdd,
  excludeMealId,
}: {
  onAdd: (item: BuilderItem) => void;
  excludeMealId?: string;
}) {
  const { data, isLoading, isError } = useMeals();
  const meals = (data ?? []).filter((m) => m.id !== excludeMealId);

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">
        Nested meals fold in their current per-portion macros at save time.
      </p>
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
            No other meals to nest.
          </p>
        ) : (
          meals.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() =>
                onAdd({
                  key: builderKey(),
                  name: m.name,
                  amount: 1,
                  source: {
                    kind: "childMeal",
                    childMealId: m.id,
                    perPortion: coerceMacros(m.perPortion),
                  },
                })
              }
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
