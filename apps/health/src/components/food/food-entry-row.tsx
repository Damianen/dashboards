"use client";

import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";

import type { FoodEntryView } from "@/lib/food";
import { formatNumber } from "@/lib/format";
import { useDeleteFoodEntry } from "@/lib/hooks/use-delete-food-entry";

const REVEAL_PX = 96;

/**
 * One diary row. Swipe left OR tap the trailing trash button to reveal a Delete
 * button (pure pointer-event drag — `touch-action: pan-y` keeps vertical
 * scrolling native, and a vertical scroll fires pointercancel so the row never
 * drags). The revealed red Delete is the destructive tap; the visible trash is
 * only the discoverable way in. Tapping the open row closes it.
 */
export function FoodEntryRow({
  entry,
  day,
}: {
  entry: FoodEntryView;
  day: string;
}) {
  const { mutate, isPending } = useDeleteFoodEntry(day);
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startOffset = useRef(0);
  const moved = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    dragging.current = true;
    setIsDragging(true);
    moved.current = false;
    startX.current = e.clientX;
    startOffset.current = offset;
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > 4) moved.current = true;
    setOffset(Math.max(-REVEAL_PX, Math.min(0, startOffset.current + dx)));
  }
  function settle() {
    if (!dragging.current) return;
    dragging.current = false;
    setIsDragging(false);
    setOffset((o) => (o < -REVEAL_PX / 2 ? -REVEAL_PX : 0));
  }
  function cancel() {
    dragging.current = false;
    setIsDragging(false);
    setOffset(startOffset.current);
  }

  const open = offset <= -REVEAL_PX / 2;

  return (
    <div className="bg-destructive relative overflow-hidden rounded-md">
      <button
        type="button"
        aria-label={`Delete ${entry.displayName}`}
        onClick={() => mutate(entry)}
        disabled={isPending}
        className="text-destructive-foreground absolute inset-y-0 right-0 flex w-24 items-center justify-center gap-1.5 text-sm font-medium disabled:opacity-50"
      >
        <Trash2 className="size-4" aria-hidden />
        Delete
      </button>

      {/* A div (not a button) so the trailing control isn't nested-interactive. */}
      <div
        onClick={() => {
          if (open && !moved.current) setOffset(0);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={settle}
        onPointerCancel={cancel}
        style={{
          transform: `translateX(${offset}px)`,
          touchAction: "pan-y",
          transition: isDragging ? "none" : "transform 150ms ease-out",
        }}
        className="bg-card flex min-h-[3.25rem] w-full items-center justify-between gap-2 py-2 pr-1 pl-3 text-left"
      >
        <div className="min-w-0">
          <div className="truncate font-medium">{entry.displayName}</div>
          {entry.portions != null ? (
            <div className="text-muted-foreground text-xs tabular-nums">
              {formatNumber(entry.portions, 2)}{" "}
              {entry.portions === 1 ? "portion" : "portions"}
            </div>
          ) : !entry.isCustom && entry.quantityG != null ? (
            <div className="text-muted-foreground text-xs tabular-nums">
              {formatNumber(entry.quantityG, 1)} g
            </div>
          ) : null}
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <span className="font-semibold">{formatNumber(entry.kcal)}</span>
          <span className="text-muted-foreground ml-1 text-xs">kcal</span>
        </div>
        <button
          type="button"
          aria-label={`Show delete for ${entry.displayName}`}
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            // Same drag guard as the row: a swipe that starts on this button
            // must not fire a click that undoes the settle it just caused.
            if (moved.current) return;
            setOffset(open ? 0 : -REVEAL_PX);
          }}
          className="hover:bg-accent text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-md transition-colors"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
