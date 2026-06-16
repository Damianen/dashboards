"use client";

import { cn } from "@/lib/utils";

export interface ToastData {
  id: number;
  message: string;
  variant?: "default" | "error";
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
        <button
          key={toast.id}
          type="button"
          onClick={() => onDismiss(toast.id)}
          role={toast.variant === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto w-full max-w-screen-sm rounded-xl px-4 py-3 text-left text-sm font-medium shadow-lg ring-1 animate-in fade-in slide-in-from-bottom-2",
            toast.variant === "error"
              ? "bg-destructive text-white ring-black/10"
              : "bg-foreground text-background ring-black/10",
          )}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
