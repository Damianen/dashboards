"use client";

import * as React from "react";

/**
 * Desktop niceties. "q" opens quick add (ignored while typing or when a sheet
 * is already open); Esc is handled natively by the vaul drawers. Renders
 * nothing — it only owns a global keydown listener. Takes the opener as a prop
 * so it stays decoupled from the sheet provider.
 */
export function KeyboardShortcuts({
  onQuickAdd,
}: {
  onQuickAdd: () => void;
}): null {
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const typing =
        target !== null &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;

      // Don't reopen quick add (or steal a key) while any sheet/dialog is open.
      const sheetOpen =
        document.querySelector(
          '[data-slot="drawer-content"], [role="dialog"]',
        ) !== null;

      if (event.key.toLowerCase() === "q" && !sheetOpen) {
        event.preventDefault();
        onQuickAdd();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onQuickAdd]);

  return null;
}
