"use client";

import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
} from "lucide-react";

import { SupplementFormSheet } from "@/components/supplements/supplement-form-sheet";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import {
  useArchiveSupplement,
  useReorderSupplements,
  useSupplements,
  type SupplementDTO,
} from "@/lib/hooks/use-supplements";
import {
  SUPPLEMENT_TIME_GROUP_LABELS,
  type SupplementTimeGroup,
} from "@/lib/schemas/supplement";
import { SUPPLEMENT_TIME_GROUPS } from "@/lib/supplement-checklist";

const iconBtn =
  "flex size-11 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-30";

type Tab = "active" | "archived";

export function ManageSupplements() {
  const [tab, setTab] = useState<Tab>("active");
  // Fetch everything once; filter client-side so the archive flip is instant.
  const { data, isLoading, isError, refetch, isFetching } =
    useSupplements(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<SupplementDTO | undefined>(undefined);

  const archive = useArchiveSupplement();
  const reorder = useReorderSupplements();

  const showArchived = tab === "archived";
  const shown = (data ?? []).filter((s) =>
    showArchived ? s.archived : !s.archived,
  );

  function openAdd() {
    setEditing(undefined);
    setSheetOpen(true);
  }
  function openEdit(s: SupplementDTO) {
    setEditing(s);
    setSheetOpen(true);
  }

  function move(
    timeGroup: SupplementTimeGroup,
    items: SupplementDTO[],
    index: number,
    delta: number,
  ) {
    const target = index + delta;
    const a = items[index];
    const b = items[target];
    if (!a || !b) return;
    const ids = items.map((i) => i.id);
    ids[index] = b.id;
    ids[target] = a.id;
    reorder.mutate({ timeGroup, ids });
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Manage supplements</h1>
        <Button size="sm" onClick={openAdd}>
          <Plus className="size-4" aria-hidden />
          Add
        </Button>
      </header>

      <Segmented
        ariaLabel="Supplement filter"
        value={tab}
        onChange={setTab}
        options={[
          { value: "active", label: "Active" },
          { value: "archived", label: "Archived" },
        ]}
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="space-y-3 py-6 text-center">
          <p className="text-muted-foreground text-sm">
            Couldn&apos;t load supplements.
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
          {showArchived
            ? "No archived supplements."
            : "No supplements yet — add the ones you take."}
        </p>
      ) : (
        <div className="space-y-5">
          {SUPPLEMENT_TIME_GROUPS.map((group) => {
            const items = shown.filter((s) => s.timeGroup === group);
            if (items.length === 0) return null;
            return (
              <section key={group} className="space-y-2">
                <h2 className="text-muted-foreground text-sm font-semibold">
                  {SUPPLEMENT_TIME_GROUP_LABELS[group]}
                </h2>
                <div className="space-y-2">
                  {items.map((s, index) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-1 rounded-lg border p-2 pl-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{s.name}</p>
                        <p className="text-muted-foreground text-sm tabular-nums">
                          {formatNumber(s.dose, 2)} {s.unit}
                        </p>
                      </div>

                      {!showArchived && (
                        <>
                          <button
                            type="button"
                            aria-label={`Move ${s.name} up`}
                            className={iconBtn}
                            disabled={index === 0 || reorder.isPending}
                            onClick={() => move(group, items, index, -1)}
                          >
                            <ChevronUp className="size-5" aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label={`Move ${s.name} down`}
                            className={iconBtn}
                            disabled={
                              index === items.length - 1 || reorder.isPending
                            }
                            onClick={() => move(group, items, index, 1)}
                          >
                            <ChevronDown className="size-5" aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label={`Edit ${s.name}`}
                            className={iconBtn}
                            onClick={() => openEdit(s)}
                          >
                            <Pencil className="size-4" aria-hidden />
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        aria-label={
                          s.archived
                            ? `Unarchive ${s.name}`
                            : `Archive ${s.name}`
                        }
                        className={`${iconBtn} text-muted-foreground`}
                        disabled={archive.isPending}
                        onClick={() =>
                          archive.mutate({ id: s.id, archived: !s.archived })
                        }
                      >
                        {s.archived ? (
                          <ArchiveRestore className="size-4" aria-hidden />
                        ) : (
                          <Archive className="size-4" aria-hidden />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <SupplementFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        supplement={editing}
      />
    </div>
  );
}
