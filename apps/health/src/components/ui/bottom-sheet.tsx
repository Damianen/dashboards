"use client";

import { Drawer } from "vaul";

import { cn } from "@/lib/utils";

/**
 * The app's one bottom-sheet primitive: a vaul drawer sliding up from the
 * bottom edge, with the drag handle, overlay, rounded top, and safe-area
 * bottom padding every sheet shares. Title and description are required so
 * every sheet stays labelled for screen readers; both render sr-only unless
 * shown. Callers own everything inside the body — including open-gating and
 * keyed remounts of their children.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  showTitle = false,
  showDescription = false,
  titleClassName,
  descriptionClassName,
  trigger,
  variant = "sheet",
  contentClassName,
  bodyClassName,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible dialog label. Rendered sr-only unless `showTitle`. */
  title: React.ReactNode;
  /** Accessible dialog description. Rendered sr-only unless `showDescription`. */
  description: React.ReactNode;
  showTitle?: boolean;
  showDescription?: boolean;
  /** Applied to the title only when visible. */
  titleClassName?: string;
  /** Applied to the description only when visible. */
  descriptionClassName?: string;
  /** Optional open button, rendered via `Drawer.Trigger asChild` so focus returns to it on close. */
  trigger?: React.ReactNode;
  /** "sheet" caps height at 90dvh; "menu" hugs its content (action menus). */
  variant?: "sheet" | "menu";
  /** Merged last onto Drawer.Content, e.g. "max-h-[85dvh]". */
  contentClassName?: string;
  /** Merged onto the inner body div (base: "mx-auto w-full max-w-md p-4"). */
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      {trigger != null && <Drawer.Trigger asChild>{trigger}</Drawer.Trigger>}
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Drawer.Content
          className={cn(
            "bg-card fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border-t outline-none",
            variant === "sheet" && "mt-24 max-h-[90dvh]",
            contentClassName,
          )}
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full" />
          <div className={cn("mx-auto w-full max-w-md p-4", bodyClassName)}>
            <Drawer.Title className={showTitle ? titleClassName : "sr-only"}>
              {title}
            </Drawer.Title>
            <Drawer.Description
              className={showDescription ? descriptionClassName : "sr-only"}
            >
              {description}
            </Drawer.Description>
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/** A full-width action row for `variant="menu"` sheets: icon + label, ≥44px tall. */
export function BottomSheetAction({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "hover:bg-accent flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left text-base font-medium transition-colors",
        destructive && "text-destructive",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
