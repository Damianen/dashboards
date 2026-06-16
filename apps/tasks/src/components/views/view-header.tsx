"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** Sticky header for drill-in views: 44px back button, title, optional action. */
export function ViewHeader({
  title,
  backHref = "/browse",
  leading,
  action,
}: {
  title: string;
  backHref?: string;
  leading?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 -mx-4 flex items-center gap-1 border-b bg-background/85 px-4 py-2 backdrop-blur">
      <Link
        href={backHref}
        aria-label="Back"
        className="-ml-3 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
      >
        <ArrowLeft className="size-5" aria-hidden />
      </Link>
      {leading}
      <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{title}</h1>
      {action}
    </header>
  );
}
