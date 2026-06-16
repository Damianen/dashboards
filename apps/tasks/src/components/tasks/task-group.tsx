import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Section header above a list; the overdue tone reads in destructive red. */
export function TaskGroup({
  title,
  count,
  tone = "default",
  children,
}: {
  title: string;
  count?: number;
  tone?: "default" | "overdue";
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col">
      <h2
        className={cn(
          "flex items-baseline gap-1.5 px-1 pt-4 pb-1 text-sm font-semibold",
          tone === "overdue" ? "text-destructive" : "text-foreground",
        )}
      >
        {title}
        {count !== undefined && (
          <span className="text-xs font-normal text-muted-foreground">
            {count}
          </span>
        )}
      </h2>
      {children}
    </section>
  );
}
