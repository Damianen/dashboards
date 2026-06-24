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

export function TemplatesSection({ query = "" }: { query?: string }) {
  const [tab, setTab] = useState<Tab>("active");
  const includeArchived = tab === "archived";
  const { data, isLoading, isError, refetch, isFetching } =
    useTemplates(includeArchived);

  const q = query.trim().toLowerCase();
  // The server already filters by archived; filtering again keeps the optimistic
  // archive flip instant. The name filter powers the header search.
  const shown = (data ?? [])
    .filter((t) => (tab === "archived" ? t.archived : !t.archived))
    .filter((t) => q === "" || t.name.toLowerCase().includes(q));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Templates</h2>
        <Button asChild size="sm">
          <Link href="/lifting/templates/new">
            <Plus className="size-4" aria-hidden />
            Template
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

      <p className="text-muted-foreground text-sm font-medium">
        My Templates ({shown.length})
      </p>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
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
          {q !== ""
            ? "No templates match your search."
            : tab === "archived"
              ? "No archived templates."
              : "No templates yet — create one to start a workout in a tap."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {shown.map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
        </div>
      )}
    </section>
  );
}
