"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { BudgetView } from "@/lib/budgets";
import type { CategoryListItem } from "@/lib/inbox";

// Bottom sheet to set a monthly limit. Create mode (target === null) picks a
// category; edit mode shows the category and offers Delete. Validation is
// enforced server-side; the client only blocks an empty/zero amount.
export function BudgetEditorSheet({
  open,
  target,
  categories,
  pending,
  onOpenChange,
  onSave,
  onDelete,
}: {
  open: boolean;
  target: BudgetView | null;
  categories: CategoryListItem[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (categoryId: string, limit: string) => void;
  onDelete: (id: string) => void;
}) {
  const isEdit = target !== null;

  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  // Reset fields whenever the sheet (re)opens on a different target — the
  // "adjust state during render" pattern, no effect needed.
  const stateKey = open ? (target?.id ?? "new") : "closed";
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (lastKey !== stateKey) {
    setLastKey(stateKey);
    if (open) {
      setAmount(target ? target.limit : "");
      setCategoryId(target?.categoryId ?? "");
    }
  }

  // Fall back to the first available category until the user picks one.
  const effectiveCategoryId = categoryId || categories[0]?.id || "";
  const validAmount = /^\d+(\.\d{1,2})?$/.test(amount.trim()) && Number(amount) > 0;
  const canSave = validAmount && (isEdit || effectiveCategoryId !== "");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0 pb-[env(safe-area-inset-bottom)]">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit budget" : "Add budget"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? target.categoryName
              : "Pick a category and set a monthly limit."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pt-1">
          {!isEdit && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Category</span>
              <select
                value={effectiveCategoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={categories.length === 0}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm dark:bg-input/30"
              >
                {categories.length === 0 ? (
                  <option value="">Every category already has a budget</option>
                ) : (
                  categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Monthly limit</span>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">€</span>
              <Input
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-9"
              />
            </div>
          </label>
        </div>

        <SheetFooter>
          <Button
            size="lg"
            disabled={!canSave || pending}
            onClick={() => onSave(effectiveCategoryId, amount.trim())}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
          {isEdit && (
            <Button
              variant="destructive"
              size="lg"
              disabled={pending}
              onClick={() => onDelete(target.id)}
            >
              Delete budget
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
