"use client";

import { cn } from "@/lib/utils";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastData {
  id: number;
  message: string;
  variant?: "default" | "error";
  action?: ToastAction;
}

/** Fixed stack just above the tab bar; tap a toast to dismiss it early. */
export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastData[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.variant === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex w-full max-w-screen-sm items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ring-1 animate-in fade-in slide-in-from-bottom-2",
            toast.variant === "error"
              ? "bg-destructive text-white ring-black/10"
              : "bg-foreground text-background ring-black/10",
          )}
        >
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="min-w-0 flex-1 text-left"
          >
            {toast.message}
          </button>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick();
                onDismiss(toast.id);
              }}
              className="-my-1 -mr-1 inline-flex h-11 shrink-0 items-center rounded-lg px-3 font-semibold underline underline-offset-2 active:opacity-70"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
