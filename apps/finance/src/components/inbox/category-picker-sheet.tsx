"use client";

import { useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { CategoryListItem, InboxItem } from "@/lib/inbox";
import { cn } from "@/lib/utils";

// Bottom-sheet category picker. Tapping a category files the transaction; the
// "also create a rule" toggle is disabled when there is no merchantKey to match.
export function CategoryPickerSheet({
  item,
  categories,
  onOpenChange,
  onPick,
}: {
  item: InboxItem | null;
  categories: CategoryListItem[];
  onOpenChange: (open: boolean) => void;
  onPick: (categoryId: string, createRule: boolean) => void;
}) {
  const [createRule, setCreateRule] = useState(false);
  // Reset the toggle when a different transaction opens the sheet — the
  // recommended "adjust state during render" pattern, no effect needed.
  const [lastItemId, setLastItemId] = useState(item?.id);
  if (item?.id !== lastItemId) {
    setLastItemId(item?.id);
    setCreateRule(false);
  }

  const open = item !== null;
  const canCreateRule = Boolean(item?.merchantKey);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[80dvh] gap-0 pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader>
          <SheetTitle>Choose a category</SheetTitle>
          <SheetDescription className="truncate">
            {item?.counterparty ?? item?.merchantKey ?? item?.descriptionRaw ?? ""}
          </SheetDescription>
        </SheetHeader>

        <ul className="flex-1 overflow-y-auto px-2">
          {categories.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c.id, createRule && canCreateRule)}
                className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-2 text-left active:bg-muted"
              >
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: c.color }}
                  aria-hidden
                />
                <span className="flex-1 truncate">{c.name}</span>
                {c.kind === "income" && (
                  <span className="text-xs text-muted-foreground">income</span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <label
          className={cn(
            "flex items-center gap-3 border-t p-4",
            !canCreateRule && "opacity-50",
          )}
        >
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={createRule && canCreateRule}
            disabled={!canCreateRule}
            onChange={(e) => setCreateRule(e.target.checked)}
          />
          <span className="text-sm">
            Also create a rule for{" "}
            <span className="font-medium">
              {item?.merchantKey ?? "this merchant"}
            </span>
          </span>
        </label>
      </SheetContent>
    </Sheet>
  );
}
