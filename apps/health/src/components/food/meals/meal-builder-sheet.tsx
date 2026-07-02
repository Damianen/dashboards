"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { MealItemPicker } from "@/components/food/meals/meal-item-picker";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Stepper } from "@/components/ui/stepper";
import { formatNumber } from "@/lib/format";
import { useArchiveMeal } from "@/lib/hooks/use-archive-meal";
import { useCreateMeal } from "@/lib/hooks/use-create-meal";
import { useMeal } from "@/lib/hooks/use-meal";
import { useUpdateMeal } from "@/lib/hooks/use-update-meal";
import {
  type BuilderItem,
  builderItemFromView,
  builderTotals,
  itemContribution,
  toCreateMealInput,
} from "@/lib/meal-builder";

interface BuilderInitial {
  name: string;
  notes: string;
  yieldPortions: number;
  items: BuilderItem[];
}

const EMPTY: BuilderInitial = {
  name: "",
  notes: "",
  yieldPortions: 1,
  items: [],
};

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="font-semibold tabular-nums">{value}</div>
      <div className="text-muted-foreground text-[10px] uppercase">{label}</div>
    </div>
  );
}

/**
 * Create or edit a saved meal. In edit mode the meal's detail is loaded, then the form
 * is mounted fresh (keyed + gated on `open`) so it seeds from the loaded values via
 * lazy useState — no state-syncing effect. `mealId` null → create mode.
 */
export function MealBuilderSheet({
  open,
  onOpenChange,
  mealId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mealId: string | null;
}) {
  const detail = useMeal(open ? mealId : null);

  const initial: BuilderInitial | null =
    mealId == null
      ? EMPTY
      : detail.data
        ? {
            name: detail.data.name,
            notes: detail.data.notes ?? "",
            yieldPortions: detail.data.yieldPortions,
            items: detail.data.items.map(builderItemFromView),
          }
        : null;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={mealId ? "Edit meal" : "New meal"}
      description="Build a recipe from ingredients and a yield; see its per-portion macros."
      bodyClassName="space-y-4 overflow-y-auto"
    >
      {!open ? null : detail.isError ? (
        <div className="space-y-3 py-8 text-center">
          <p className="text-muted-foreground text-sm">
            Couldn&apos;t load this meal.
          </p>
          <Button variant="outline" onClick={() => void detail.refetch()}>
            Retry
          </Button>
        </div>
      ) : initial == null ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : (
        <MealBuilderForm
          key={mealId ?? "new"}
          mealId={mealId}
          initial={initial}
          onDone={() => onOpenChange(false)}
        />
      )}
    </BottomSheet>
  );
}

function MealBuilderForm({
  mealId,
  initial,
  onDone,
}: {
  mealId: string | null;
  initial: BuilderInitial;
  onDone: () => void;
}) {
  const [view, setView] = useState<"form" | "pick">("form");
  const [name, setName] = useState(initial.name);
  const [notes, setNotes] = useState(initial.notes);
  const [yieldPortions, setYieldPortions] = useState(initial.yieldPortions);
  const [items, setItems] = useState<BuilderItem[]>(initial.items);

  const create = useCreateMeal();
  const update = useUpdateMeal(mealId ?? "");
  const archive = useArchiveMeal();
  const isPending = create.isPending || update.isPending || archive.isPending;

  const totals = builderTotals(items, yieldPortions);

  function save() {
    if (name.trim() === "") {
      toast.error("Name your meal");
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one ingredient");
      return;
    }
    const input = toCreateMealInput(name, yieldPortions, notes, items);
    if (mealId) {
      update.mutate(input, { onSuccess: onDone });
    } else {
      create.mutate(input, { onSuccess: onDone });
    }
  }

  if (view === "pick") {
    return (
      <MealItemPicker
        excludeMealId={mealId ?? undefined}
        onCancel={() => setView("form")}
        onAdd={(item) => {
          setItems((cur) => [...cur, item]);
          setView("form");
        }}
      />
    );
  }

  return (
    <>
      <h2 className="text-base font-semibold">
        {mealId ? "Edit meal" : "New meal"}
      </h2>

      <div className="space-y-1.5">
        <Label htmlFor="meal-name">Name</Label>
        <Input
          id="meal-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Chicken & Rice"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="meal-yield">Yield (portions this makes)</Label>
        <Stepper
          id="meal-yield"
          label="portions"
          value={yieldPortions}
          onChange={setYieldPortions}
          step={1}
          min={1}
          max={9999}
          inputMode="decimal"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Ingredients</Label>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setView("pick")}
          >
            <Plus className="size-4" aria-hidden />
            Add item
          </Button>
        </div>

        {items.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            No ingredients yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <ItemRow
                key={item.key}
                item={item}
                onAmount={(amount) =>
                  setItems((cur) =>
                    cur.map((i) => (i.key === item.key ? { ...i, amount } : i)),
                  )
                }
                onRemove={() =>
                  setItems((cur) => cur.filter((i) => i.key !== item.key))
                }
              />
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="meal-notes">Notes (optional)</Label>
        <Input
          id="meal-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. add chili to taste"
        />
      </div>

      <div className="bg-muted space-y-2 rounded-lg p-3">
        <div className="text-muted-foreground text-[10px] font-medium uppercase">
          Per portion
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Stat value={formatNumber(totals.perPortion.kcal ?? 0)} label="kcal" />
          <Stat
            value={`${formatNumber(totals.perPortion.proteinG ?? 0, 1)}g`}
            label="protein"
          />
          <Stat
            value={`${formatNumber(totals.perPortion.carbG ?? 0, 1)}g`}
            label="carbs"
          />
          <Stat
            value={`${formatNumber(totals.perPortion.fatG ?? 0, 1)}g`}
            label="fat"
          />
        </div>
        <div className="text-muted-foreground text-center text-xs">
          Total {formatNumber(totals.total.kcal ?? 0)} kcal ·{" "}
          {formatNumber(yieldPortions, 2)} portions
        </div>
      </div>

      <Button
        type="button"
        className="h-12 w-full text-base"
        onClick={save}
        disabled={isPending}
      >
        {mealId ? "Save changes" : "Create meal"}
      </Button>

      {mealId && (
        <Button
          type="button"
          variant="ghost"
          className="text-destructive w-full"
          disabled={isPending}
          onClick={() => archive.mutate({ id: mealId }, { onSuccess: onDone })}
        >
          Archive meal
        </Button>
      )}
    </>
  );
}

function ItemRow({
  item,
  onAmount,
  onRemove,
}: {
  item: BuilderItem;
  onAmount: (amount: number) => void;
  onRemove: () => void;
}) {
  const contribution = itemContribution(item);
  const isPortions = item.source.kind === "childMeal";
  const isFree = item.source.kind === "free";

  return (
    <li className="bg-background space-y-2 rounded-md border p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{item.name}</div>
          <div className="text-muted-foreground text-xs tabular-nums">
            {formatNumber(contribution.kcal ?? 0)} kcal
          </div>
        </div>
        <button
          type="button"
          aria-label={`Remove ${item.name}`}
          onClick={onRemove}
          className="hover:bg-accent flex size-8 shrink-0 items-center justify-center rounded-md transition-colors"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {!isFree && (
        <Stepper
          label={isPortions ? "portions" : "grams"}
          value={item.amount}
          onChange={onAmount}
          step={isPortions ? 0.5 : 10}
          min={isPortions ? 0.5 : 1}
          max={isPortions ? 9999 : 5000}
          inputMode="decimal"
        />
      )}
    </li>
  );
}
