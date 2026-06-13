import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

// Floats above the tab bar; quick-add wiring comes in a later phase.
export function Fab() {
  return (
    <Button
      size="icon"
      aria-label="Add task"
      className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 size-14 rounded-full shadow-lg"
    >
      <Plus className="size-6" aria-hidden />
    </Button>
  );
}
