"use client";

import { Check } from "lucide-react";
import * as React from "react";

import {
  DrawerContent,
  DrawerNested,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useLabels } from "@/hooks/use-task-queries";
import { cn } from "@/lib/utils";

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/** Controlled multi-select; commits the new id set once, on close. */
export function LabelPicker({
  value,
  onChange,
  children,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>(value);
  const labels = useLabels();

  function handleOpenChange(next: boolean) {
    if (next) {
      setSelected(value);
    } else if (!sameSet(selected, value)) {
      onChange(selected);
    }
    setOpen(next);
  }

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const labelList = labels.data ?? [];

  return (
    <DrawerNested open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>{children}</DrawerTrigger>
      <DrawerContent className="max-h-[80dvh]">
        <DrawerTitle className="px-4 pt-3 pb-1 text-sm font-semibold text-muted-foreground">
          Labels
        </DrawerTitle>
        {labelList.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No labels yet.
          </p>
        ) : (
          <ul className="overflow-y-auto px-2 pb-4">
            {labelList.map((label) => {
              const checked = selected.includes(label.id);
              return (
                <li key={label.id}>
                  <button
                    type="button"
                    onClick={() => toggle(label.id)}
                    aria-pressed={checked}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm active:bg-muted",
                      checked && "font-medium",
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{label.name}</span>
                    {checked && (
                      <Check className="size-4 shrink-0 text-primary" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </DrawerContent>
    </DrawerNested>
  );
}
