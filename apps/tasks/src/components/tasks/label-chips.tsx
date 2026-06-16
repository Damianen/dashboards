"use client";

import type { Label } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

/** Inline label pills: a colour dot plus the name, wrapping on overflow. */
export function LabelChips({
  labels,
  className,
}: {
  labels: Label[];
  className?: string;
}) {
  if (labels.length === 0) return null;
  return (
    <span className={cn("flex flex-wrap items-center gap-1", className)}>
      {labels.map((label) => (
        <span
          key={label.id}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[0.6875rem] font-medium text-muted-foreground"
        >
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: label.color }}
          />
          {label.name}
        </span>
      ))}
    </span>
  );
}
