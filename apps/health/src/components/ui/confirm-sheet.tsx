"use client";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";

/**
 * The app's confirm affordance for destructive actions: a menu-variant
 * BottomSheet with a red confirm button and a ghost Cancel. Deliberately a
 * two-step (open + confirm) — never used for reversible actions, which get
 * toast Undo instead.
 */
export function ConfirmSheet({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      variant="menu"
      title={title}
      description={description}
      showTitle
      showDescription
      titleClassName="text-base font-semibold"
      descriptionClassName="text-muted-foreground pt-1 text-sm"
      bodyClassName="space-y-2 pt-2"
    >
      <Button
        type="button"
        variant="destructive"
        className="h-12 w-full text-base"
        disabled={busy}
        onClick={onConfirm}
      >
        {confirmLabel}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="h-11 w-full"
        disabled={busy}
        onClick={() => onOpenChange(false)}
      >
        Cancel
      </Button>
    </BottomSheet>
  );
}
