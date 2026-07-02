"use client";

import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Progressive-overload confirm: last session hit the top of the rep range, so
 * the weight prefill was bumped — accept it or keep editing. Handlers live at
 * the call site (they touch caller field state).
 */
export function BumpPopup({
  weightKg,
  onAccept,
  onDismiss,
  className,
}: {
  weightKg: number;
  onAccept: () => void;
  onDismiss: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-primary/40 bg-primary/5 space-y-2 rounded-lg border p-3",
        className,
      )}
    >
      <p className="text-sm">
        Hit the top of the range last time — bump to{" "}
        <span className="font-medium">{formatNumber(weightKg, 1)} kg</span>?
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="secondary"
          className="h-11"
          onClick={onDismiss}
        >
          Keep editing
        </Button>
        <Button type="button" className="h-11" onClick={onAccept}>
          Accept
        </Button>
      </div>
    </div>
  );
}
