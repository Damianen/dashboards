"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface DirtyRegistry {
  report: (id: string, dirty: boolean) => void;
  remove: (id: string) => void;
}

const FoodDialogDirtyContext = createContext<DirtyRegistry | null>(null);

/**
 * Reports a form's dirtiness to the enclosing FoodDialog so its close guard
 * knows when to ask before discarding. Pass a derived boolean ("any input
 * differs from its default"); unmounting (tab switch, view swap) withdraws
 * the report, since the state it described is gone anyway. No-op when
 * rendered outside a FoodDialog.
 */
export function useFoodDialogDirty(dirty: boolean): void {
  const registry = useContext(FoodDialogDirtyContext);
  const id = useId();
  useEffect(() => {
    if (registry == null) return;
    registry.report(id, dirty);
    return () => registry.remove(id);
  }, [registry, id, dirty]);
}

/**
 * The food flows' modal container: a centered dialog with a pinned title + X
 * header and an internally scrolling body, so content scrolling can never
 * dismiss it (unlike the swipeable BottomSheet). Dismiss gestures (X, outside
 * tap, Escape) first ask "Discard entry?" when any enclosed form reported
 * dirty via useFoodDialogDirty (or the `dirty` prop is set); pristine dialogs
 * close instantly. Programmatic closes — the parent flipping `open` after a
 * successful log — skip the guard entirely.
 */
export function FoodDialog({
  open,
  onOpenChange,
  title,
  description,
  dirty = false,
  footer,
  contentClassName,
  bodyClassName,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown in the pinned header; also the accessible dialog label. */
  title: React.ReactNode;
  /** Accessible dialog description, rendered sr-only. */
  description: React.ReactNode;
  /** Shell-level dirtiness, OR'd with the children's useFoodDialogDirty reports. */
  dirty?: boolean;
  /** Optional pinned actions row under the scrolling body. */
  footer?: React.ReactNode;
  /** Merged last onto the dialog panel, e.g. "h-[90dvh]". */
  contentClassName?: string;
  /** Merged onto the scrolling body div (base: "p-4"). */
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  // The registry is deliberately not state: children report dirtiness without
  // re-rendering the dialog, and the close guard reads the map synchronously
  // per dismiss attempt (leaf effects have run by the time a gesture lands).
  const [dirtyMap] = useState(() => new Map<string, boolean>());
  const registry = useMemo<DirtyRegistry>(
    () => ({
      report: (id, value) => void dirtyMap.set(id, value),
      remove: (id) => void dirtyMap.delete(id),
    }),
    [dirtyMap],
  );
  const keepEditingRef = useRef<HTMLButtonElement>(null);

  // A pending confirm must not survive an open-state transition: if a slow
  // mutation closes the dialog underneath it, a stale confirmOpen would pop
  // the confirm on the NEXT open.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    setConfirmOpen(false);
  }

  // `open` is fully controlled, so Radix never closes the dialog itself: every
  // dismiss gesture (X, Escape, outside tap) only lands here as `next=false`,
  // and swallowing it keeps the dialog open.
  function handleOpenChange(next: boolean) {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (dirty || Array.from(dirtyMap.values()).some(Boolean)) {
      setConfirmOpen(true);
    } else {
      onOpenChange(false);
    }
  }

  function discard() {
    setConfirmOpen(false);
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          showCloseButton={false}
          // Parity with vaul, which suppresses mount focus: only children with
          // an explicit autoFocus attribute pop the keyboard.
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            "flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-w-md",
            contentClassName,
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b py-2 pr-2 pl-4">
            <DialogTitle className="min-w-0 truncate text-base leading-normal font-semibold">
              {title}
            </DialogTitle>
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 shrink-0"
                aria-label="Close"
              >
                <X className="size-5" aria-hidden />
              </Button>
            </DialogClose>
          </div>
          <DialogDescription className="sr-only">
            {description}
          </DialogDescription>
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain p-4",
              bodyClassName,
            )}
          >
            <FoodDialogDirtyContext.Provider value={registry}>
              {children}
            </FoodDialogDirtyContext.Provider>
          </div>
          {footer != null && (
            <div className="shrink-0 border-t p-4">{footer}</div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sibling Root so the confirm stacks over the dialog with its own
          overlay and layer: while it's up, Radix routes Escape and outside
          taps only to it, so those gestures mean "keep editing". */}
      <Dialog open={open && confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          role="alertdialog"
          showCloseButton={false}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            keepEditingRef.current?.focus();
          }}
          className="w-[calc(100vw-4rem)] max-w-sm sm:max-w-sm"
        >
          <DialogTitle className="text-base">Discard entry?</DialogTitle>
          <DialogDescription>
            You have unsaved input — closing will lose it.
          </DialogDescription>
          <div className="space-y-2">
            <Button
              type="button"
              variant="destructive"
              className="h-12 w-full text-base"
              onClick={discard}
            >
              Discard
            </Button>
            <Button
              ref={keepEditingRef}
              type="button"
              variant="ghost"
              className="h-11 w-full"
              onClick={() => setConfirmOpen(false)}
            >
              Keep editing
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
