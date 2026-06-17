"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { TemplateCard } from "@/components/lifting/template-card";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useTemplates } from "@/lib/hooks/use-templates";

type Tab = "active" | "archived";

export function TemplatesSection() {
  const [tab, setTab] = useState<Tab>("active");
  const includeArchived = tab === "archived";
  const { data, isLoading, isError, refetch, isFetching } =
    useTemplates(includeArchived);

  // The server already filters by archived; filtering again keeps the optimistic
  // archive flip instant (the flipped row leaves/enters the current tab at once).
  const shown = (data ?? []).filter((t) =>
    tab === "archived" ? t.archived : !t.archived,
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Templates</h2>
        <Button asChild size="sm" variant="outline">
          <Link href="/lifting/templates/new">
            <Plus className="size-4" aria-hidden />
            New template
          </Link>
        </Button>
      </div>

      <Segmented
        ariaLabel="Template filter"
        value={tab}
        onChange={setTab}
        options={[
          { value: "active", label: "Active" },
          { value: "archived", label: "Archived" },
        ]}
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="space-y-3 py-6 text-center">
          <p className="text-muted-foreground text-sm">
            Couldn&apos;t load templates.
          </p>
          <Button
            variant="outline"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            Retry
          </Button>
        </div>
      ) : shown.length === 0 ? (
        <p className="text-muted-foreground py-2 text-sm">
          {tab === "archived"
            ? "No archived templates."
            : "No templates yet — create one to start a workout in a tap."}
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
        </div>
      )}
    </section>
  );
}
