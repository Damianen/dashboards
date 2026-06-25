"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Drawer } from "vaul";

import { DailyPlanItemPicker } from "@/components/food/daily-plans/daily-plan-item-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Stepper } from "@/components/ui/stepper";
import {
  itemContribution,
  type PlanBuilderItem,
  planItemFromView,
  planTotal,
  toCreateDailyPlanInput,
} from "@/lib/daily-plan-builder";
import { MEAL_LABELS, MEAL_ORDER, type MealSlot } from "@/lib/food";
import { formatNumber } from "@/lib/format";
import { useArchiveDailyPlan } from "@/lib/hooks/use-archive-daily-plan";
import { useCreateDailyPlan } from "@/lib/hooks/use-create-daily-plan";
import { useDailyPlan } from "@/lib/hooks/use-daily-plan";
import { useUpdateDailyPlan } from "@/lib/hooks/use-update-daily-plan";
import { cn } from "@/lib/utils";

interface BuilderInitial {
  name: string;
  notes: string;
  items: PlanBuilderItem[];
}

const EMPTY: BuilderInitial = { name: "", notes: "", items: [] };

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="font-semibold tabular-nums">{value}</div>
      <div className="text-muted-foreground text-[10px] uppercase">{label}</div>
    </div>
  );
}

/**
 * Create or edit a daily plan. In edit mode the plan's detail is loaded, then the form
 * is mounted fresh (keyed + gated on `open`) so it seeds from the loaded values via
 * lazy useState — no state-syncing effect. `planId` null → create mode.
 */
export function DailyPlanBuilderSheet({
  open,
  onOpenChange,
  planId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string | null;
}) {
  const detail = useDailyPlan(open ? planId : null);

  const initial: BuilderInitial | null =
    planId == null
      ? EMPTY
      : detail.data
        ? {
            name: detail.data.name,
            notes: detail.data.notes ?? "",
            items: detail.data.items.map(planItemFromView),
          }
        : null;

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Drawer.Content
          className="bg-card fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[90dvh] flex-col rounded-t-2xl border-t outline-none"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full" />
          <div className="mx-auto w-full max-w-md space-y-4 overflow-y-auto p-4">
            <Drawer.Title className="sr-only">
              {planId ? "Edit plan" : "New plan"}
            </Drawer.Title>
            <Drawer.Description className="sr-only">
              Build a reusable set of food and meal items to apply to a day&apos;s
              diary.
            </Drawer.Description>

            {!open ? null : detail.isError ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                Couldn&apos;t load this plan.
              </p>
            ) : initial == null ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-md" />
                ))}
              </div>
            ) : (
              <DailyPlanBuilderForm
                key={planId ?? "new"}
                planId={planId}
                initial={initial}
                onDone={() => onOpenChange(false)}
              />
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function DailyPlanBuilderForm({
  planId,
  initial,
  onDone,
}: {
  planId: string | null;
  initial: BuilderInitial;
  onDone: () => void;
}) {
  const [view, setView] = useState<"form" | "pick">("form");
  const [name, setName] = useState(initial.name);
  const [notes, setNotes] = useState(initial.notes);
  const [items, setItems] = useState<PlanBuilderItem[]>(initial.items);

  const create = useCreateDailyPlan();
  const update = useUpdateDailyPlan(planId ?? "");
  const archive = useArchiveDailyPlan();
  const isPending = create.isPending || update.isPending || archive.isPending;

  const total = planTotal(items);

  function save() {
    if (name.trim() === "") {
      toast.error("Name your plan");
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one item");
      return;
    }
    const input = toCreateDailyPlanInput(name, notes, items);
    if (planId) {
      update.mutate(input, { onSuccess: onDone });
    } else {
      create.mutate(input, { onSuccess: onDone });
    }
  }

  if (view === "pick") {
    return (
      <DailyPlanItemPicker
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
        {planId ? "Edit plan" : "New plan"}
      </h2>

      <div className="space-y-1.5">
        <Label htmlFor="plan-name">Name</Label>
        <Input
          id="plan-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Workday"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Items</Label>
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
            No items yet.
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
                onSlot={(mealSlot) =>
                  setItems((cur) =>
                    cur.map((i) =>
                      i.key === item.key ? { ...i, mealSlot } : i,
                    ),
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
        <Label htmlFor="plan-notes">Notes (optional)</Label>
        <Input
          id="plan-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. gym days"
        />
      </div>

      <div className="bg-muted space-y-2 rounded-lg p-3">
        <div className="text-muted-foreground text-[10px] font-medium uppercase">
          Plan total
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Stat value={formatNumber(total.kcal ?? 0)} label="kcal" />
          <Stat
            value={`${formatNumber(total.proteinG ?? 0, 1)}g`}
            label="protein"
          />
          <Stat
            value={`${formatNumber(total.carbG ?? 0, 1)}g`}
            label="carbs"
          />
          <Stat value={`${formatNumber(total.fatG ?? 0, 1)}g`} label="fat" />
        </div>
        <div className="text-muted-foreground text-center text-xs">
          {items.length} item{items.length === 1 ? "" : "s"}
        </div>
      </div>

      <Button
        type="button"
        className="h-12 w-full text-base"
        onClick={save}
        disabled={isPending}
      >
        {planId ? "Save changes" : "Create plan"}
      </Button>

      {planId && (
        <Button
          type="button"
          variant="ghost"
          className="text-destructive w-full"
          disabled={isPending}
          onClick={() => archive.mutate(planId, { onSuccess: onDone })}
        >
          Archive plan
        </Button>
      )}
    </>
  );
}

function ItemRow({
  item,
  onAmount,
  onSlot,
  onRemove,
}: {
  item: PlanBuilderItem;
  onAmount: (amount: number) => void;
  onSlot: (slot: MealSlot | null) => void;
  onRemove: () => void;
}) {
  const contribution = itemContribution(item);
  const isPortions = item.source.kind === "meal";

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
      <Stepper
        label={isPortions ? "portions" : "grams"}
        value={item.amount}
        onChange={onAmount}
        step={isPortions ? 0.5 : 10}
        min={isPortions ? 0.5 : 1}
        max={isPortions ? 9999 : 5000}
        inputMode="decimal"
      />
      <ItemSlotPicker value={item.mealSlot} onChange={onSlot} />
    </li>
  );
}

/** A 5-up slot picker for a plan item: "No slot" plus the four meal slots. */
function ItemSlotPicker({
  value,
  onChange,
}: {
  value: MealSlot | null;
  onChange: (slot: MealSlot | null) => void;
}) {
  const options: { slot: MealSlot | null; label: string }[] = [
    { slot: null, label: "—" },
    ...MEAL_ORDER.map((slot) => ({ slot, label: MEAL_LABELS[slot] })),
  ];
  return (
    <div className="bg-muted grid grid-cols-5 gap-1 rounded-lg p-1">
      {options.map((o) => (
        <button
          key={o.slot ?? "none"}
          type="button"
          aria-label={o.slot ? `Slot ${o.label}` : "No slot"}
          onClick={() => onChange(o.slot)}
          className={cn(
            "rounded-md py-1.5 text-[11px] font-medium transition-colors",
            value === o.slot
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
