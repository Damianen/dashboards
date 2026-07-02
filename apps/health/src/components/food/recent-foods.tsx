"use client";

import { Plus, RotateCcw } from "lucide-react";

import {
  type LoggableItem,
  MEAL_LABELS,
  type RecentLoggableDTO,
  suggestMeal,
} from "@/lib/food";
import { formatNumber } from "@/lib/format";
import { useLogFood } from "@/lib/hooks/use-log-food";
import { useRecentLoggables } from "@/lib/hooks/use-recent-loggables";
import { scaleMacros } from "@/lib/rules";

/** One instant re-log mutation shared by the chip strip and the list rows. */
function useInstantRelog(day: string, onLogged: () => void) {
  const { mutate, isPending } = useLogFood(day);

  function relog(recent: RecentLoggableDTO) {
    const { loggable, lastQuantityG } = recent;
    const source =
      loggable.ref.kind === "barcode"
        ? { barcode: loggable.ref.barcode }
        : { customFoodId: loggable.ref.customFoodId };
    const meal = suggestMeal(new Date());
    const scaled = scaleMacros(loggable.per100g, lastQuantityG);
    mutate(
      {
        input: {
          ...source,
          quantityG: lastQuantityG,
          meal,
          // Same override QuantityStep sends: the value the server would
          // snapshot anyway, passed so the caffeine card updates optimistically.
          ...(scaled.caffeineMg != null ? { caffeineMg: scaled.caffeineMg } : {}),
        },
        preview: {
          displayName: loggable.name,
          imageUrl: loggable.imageUrl,
          quantityG: lastQuantityG,
          meal,
          macros: {
            kcal: scaled.kcal ?? 0,
            proteinG: scaled.proteinG ?? 0,
            carbG: scaled.carbG ?? 0,
            fatG: scaled.fatG ?? 0,
          },
        },
      },
      { onSuccess: onLogged },
    );
  }

  return { relog, isPending };
}

/**
 * Horizontal strip of recently-logged foods, shown under the add-food tabs on
 * every landing tab. ONE tap re-logs at the last-used quantity (meal slot from
 * the current time of day) — the 2-tap fast path. While the first fetch is in
 * flight the strip's height is reserved so the tab content (e.g. the scan
 * viewfinder) doesn't shift when the chips land; a loaded-empty result
 * collapses (once, for users with no recents yet).
 */
export function RecentFoodChips({
  day,
  onLogged,
}: {
  day: string;
  onLogged: () => void;
}) {
  const { data, isLoading } = useRecentLoggables();
  const { relog, isPending } = useInstantRelog(day, onLogged);

  if (isLoading) return <div className="h-12" aria-hidden />;
  if (!data || data.length === 0) return null;

  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1"
      role="group"
      aria-label="Recently logged foods"
    >
      {data.map((recent) => (
        <button
          key={
            recent.loggable.ref.kind === "barcode"
              ? `b-${recent.loggable.ref.barcode}`
              : `c-${recent.loggable.ref.customFoodId}`
          }
          type="button"
          disabled={isPending}
          onClick={() => relog(recent)}
          className="bg-secondary text-secondary-foreground hover:bg-secondary/80 flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors disabled:opacity-60"
        >
          <Plus className="size-4 shrink-0" aria-hidden />
          <span className="max-w-36 truncate">
            {recent.loggable.name} · {formatNumber(recent.lastQuantityG)} g
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Vertical recents for the Search tab's pre-query space: tapping a row opens
 * the quantity step prefilled with the last-used amount (the adjust path);
 * the trailing button re-logs instantly at that amount. Renders nothing while
 * loading/empty — the "Type to search" prompt below is the constant content.
 */
export function RecentFoodList({
  day,
  onPick,
  onLogged,
}: {
  day: string;
  onPick: (item: LoggableItem, initialGrams: number) => void;
  onLogged: () => void;
}) {
  const { data } = useRecentLoggables();
  const { relog, isPending } = useInstantRelog(day, onLogged);

  if (!data || data.length === 0) return null;

  return (
    <ul className="space-y-1">
      {data.map((recent) => {
        const { loggable } = recent;
        const key =
          loggable.ref.kind === "barcode"
            ? `b-${loggable.ref.barcode}`
            : `c-${loggable.ref.customFoodId}`;
        return (
          <li key={key} className="flex min-h-14 items-center gap-2">
            <button
              type="button"
              onClick={() => onPick(loggable, recent.lastQuantityG)}
              className="hover:bg-accent flex min-h-14 min-w-0 flex-1 flex-col justify-center rounded-md px-2 py-1 text-left transition-colors"
            >
              <span className="truncate text-sm font-medium">
                {loggable.name}
              </span>
              <span className="text-muted-foreground truncate text-xs tabular-nums">
                {formatNumber(recent.lastQuantityG)} g
                {recent.lastMeal ? ` · ${MEAL_LABELS[recent.lastMeal]}` : ""}
                {loggable.brand ? ` · ${loggable.brand}` : ""}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Log again: ${loggable.name}`}
              disabled={isPending}
              onClick={() => relog(recent)}
              className="hover:bg-accent text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-60"
            >
              <RotateCcw className="size-4" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
