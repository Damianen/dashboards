"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { ScanTab } from "@/components/food/scan-tab";
import { SearchTab } from "@/components/food/search-tab";
import { Input } from "@/components/ui/input";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import {
  builderKey,
  type PlanBuilderItem,
} from "@/lib/daily-plan-builder";
import { coerceMacros, type FoodProductDTO } from "@/lib/food";
import { getJSON, HttpError } from "@/lib/fetcher";
import { useMeals } from "@/lib/hooks/use-meals";
import type { Macros } from "@/lib/rules";

type Tab = "search" | "scan" | "saved" | "meal";

const TABS: SegmentedOption<Tab>[] = [
  { value: "search", label: "Search" },
  { value: "scan", label: "Scan" },
  { value: "saved", label: "Saved" },
  { value: "meal", label: "Meal" },
];

interface SavedFood {
  id: string;
  name: string;
  brand: string | null;
  per100g: Partial<Macros>;
  servingG: string | null;
}

const servingAmount = (servingG: string | null): number =>
  servingG != null && Number(servingG) > 0 ? Number(servingG) : 100;

/**
 * The "add an item" step of the daily-plan builder. Each tab resolves to a
 * PlanBuilderItem and hands it back via onAdd: an OFF product (search/scan → product
 * lookup), a saved custom food, or a saved meal (logged by portions). Unlike the meal
 * builder there is no free-typed item — plan items are pure references.
 */
export function DailyPlanItemPicker({
  onAdd,
  onCancel,
}: {
  onAdd: (item: PlanBuilderItem) => void;
  onCancel: () => void;
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
        mealSlot: null,
        source: {
          kind: "product",
          barcode: product.barcode,
          per100g: product.per100g,
        },
      });
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        toast.error("Product not found — save it as a custom food first");
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
        <h2 className="text-base font-semibold">Add item</h2>
      </div>

      {!looking && (
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={TABS}
          size="sm"
          ariaLabel="Item source"
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
      ) : (
        <MealPickerList onAdd={onAdd} />
      )}
    </div>
  );
}

function SavedFoodPicker({ onAdd }: { onAdd: (item: PlanBuilderItem) => void }) {
  const [query, setQuery] = useState("");
  const { data, isFetching, isError } = useQuery({
    queryKey: ["food", "custom-search", query.trim()],
    queryFn: () =>
      getJSON<SavedFood[]>(
        `/api/food/custom${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`,
      ),
  });
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
                  amount: servingAmount(f.servingG),
                  mealSlot: null,
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

function MealPickerList({ onAdd }: { onAdd: (item: PlanBuilderItem) => void }) {
  const { data, isLoading, isError } = useMeals();
  const meals = data ?? [];

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">
        A meal logs as one combined entry, scaled by its portion count.
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
            No saved meals yet.
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
                  mealSlot: null,
                  source: {
                    kind: "meal",
                    mealId: m.id,
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
