"use client";

import { Plus } from "lucide-react";

import { useSheets } from "@/components/providers/sheet-provider";
import { Button } from "@/components/ui/button";

// Floats above the tab bar; opens the quick-add sheet.
export function Fab() {
  const { openQuickAdd } = useSheets();
  return (
    <Button
      size="icon"
      aria-label="Add task"
      onClick={openQuickAdd}
      className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 size-14 rounded-full shadow-lg transition active:scale-95"
    >
      <Plus className="size-6" aria-hidden />
    </Button>
  );
}
