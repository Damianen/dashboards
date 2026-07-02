"use client";

import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { CustomFoodForm } from "@/components/food/custom-food-form";
import { CustomTab } from "@/components/food/custom-tab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  customFoodInputToLoggable,
  customFoodToLoggable,
  type CustomFoodDTO,
  type LoggableItem,
} from "@/lib/food";
import { formatNumber } from "@/lib/format";
import { useArchiveCustomFood } from "@/lib/hooks/use-archive-custom-food";
import { useCreateCustomFood } from "@/lib/hooks/use-create-custom-food";
import { useCustomFoods } from "@/lib/hooks/use-custom-foods";
import { useUpdateCustomFood } from "@/lib/hooks/use-update-custom-food";
import type {
  CreateCustomFoodInput,
  UpdateCustomFoodInput,
} from "@/lib/schemas/food";
import { cn } from "@/lib/utils";

type View = "list" | "create" | "edit" | "oneOff";

function BackHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="hover:bg-accent flex size-9 shrink-0 items-center justify-center rounded-md transition-colors"
      >
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      <h2 className="text-base font-semibold">{title}</h2>
    </div>
  );
}

/**
 * The Add-food sheet's "My foods" tab: a reusable list of saved custom foods (manual or
 * label-scanned), recently-used first. Tap a food to log it (→ grams step, snapshotting
 * scaled macros); the pencil edits it, the archive button retires/restores it. "New
 * custom food" saves a per-100 g food to the list; "Save & log" also logs it. A quick
 * one-off (not saved) covers things you won't reuse — and the barcode-not-found fallback
 * lands here.
 */
export function MyFoodsTab({
  day,
  jumpToOneOff,
  onLog,
  onLogged,
}: {
  day: string;
  /** Barcode-not-found fallback: open straight on the quick one-off form. */
  jumpToOneOff: boolean;
  onLog: (item: LoggableItem) => void;
  onLogged: () => void;
}) {
  const [view, setView] = useState<View>(jumpToOneOff ? "oneOff" : "list");
  const [editing, setEditing] = useState<CustomFoodDTO | null>(null);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const { data, isFetching, isError } = useCustomFoods(query, showArchived);
  const results = data ?? [];

  const create = useCreateCustomFood();
  const update = useUpdateCustomFood(editing?.id ?? "");
  const archive = useArchiveCustomFood();

  function handleCreate(input: CreateCustomFoodInput, thenLog: boolean) {
    create.mutate(input, {
      onSuccess: (res) => {
        if (thenLog) {
          onLog(customFoodInputToLoggable(input, res.id));
        } else {
          toast.success("Food saved");
          setView("list");
        }
      },
    });
  }

  function handleUpdate(input: UpdateCustomFoodInput) {
    update.mutate(input, {
      onSuccess: () => {
        setEditing(null);
        setView("list");
      },
    });
  }

  if (view === "create") {
    return (
      <div className="space-y-4">
        <BackHeader title="New custom food" onBack={() => setView("list")} />
        <CustomFoodForm
          mode="create"
          busy={create.isPending}
          onCreate={handleCreate}
        />
      </div>
    );
  }

  if (view === "edit" && editing) {
    return (
      <div className="space-y-4">
        <BackHeader
          title="Edit food"
          onBack={() => {
            setEditing(null);
            setView("list");
          }}
        />
        <CustomFoodForm
          mode="edit"
          initial={editing}
          busy={update.isPending}
          onUpdate={handleUpdate}
        />
      </div>
    );
  }

  if (view === "oneOff") {
    return (
      <div className="space-y-4">
        <BackHeader title="Quick one-off" onBack={() => setView("list")} />
        <p className="text-muted-foreground text-xs">
          Logs once to today&apos;s diary without saving to My Foods.
        </p>
        <CustomTab day={day} onLogged={onLogged} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search my foods"
          aria-label="Search my foods"
          className="h-11 pl-9"
        />
      </div>

      <Button
        className="h-12 w-full text-base"
        onClick={() => setView("create")}
      >
        <Plus className="size-5" aria-hidden />
        New custom food
      </Button>

      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">
          {results.length} food{results.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="text-muted-foreground text-xs font-medium underline-offset-2 hover:underline"
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </button>
      </div>

      <ul className="max-h-[45dvh] space-y-2 overflow-y-auto">
        {isFetching && results.length === 0 ? (
          Array.from({ length: 4 }).map((_, i) => (
            <li key={i}>
              <Skeleton className="h-14 w-full rounded-md" />
            </li>
          ))
        ) : isError ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Couldn&apos;t load your foods.
          </p>
        ) : results.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No saved foods yet. Create one to log it fast.
          </p>
        ) : (
          results.map((f) => (
            <li
              key={f.id}
              className={cn(
                "bg-card flex items-center gap-1 rounded-md border pr-1",
                f.archived && "opacity-60",
              )}
            >
              <button
                type="button"
                onClick={() => onLog(customFoodToLoggable(f))}
                // Retired means not re-loggable (logFood enforces it server-side
                // too) — restore first; edit and restore stay tappable.
                disabled={f.archived}
                className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2 text-left"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{f.name}</div>
                  {f.brand && (
                    <div className="text-muted-foreground truncate text-xs">
                      {f.brand}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <span className="font-semibold">
                    {formatNumber(f.per100g.kcal ?? 0)}
                  </span>
                  <span className="text-muted-foreground ml-1 text-xs">
                    kcal/100g
                  </span>
                </div>
              </button>
              <button
                type="button"
                aria-label={`Edit ${f.name}`}
                onClick={() => {
                  setEditing(f);
                  setView("edit");
                }}
                className="hover:bg-accent flex size-9 shrink-0 items-center justify-center rounded-md transition-colors"
              >
                <Pencil className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-label={`${f.archived ? "Restore" : "Archive"} ${f.name}`}
                onClick={() =>
                  archive.mutate({ id: f.id, archived: !f.archived })
                }
                disabled={archive.isPending}
                className="hover:bg-accent flex size-9 shrink-0 items-center justify-center rounded-md transition-colors"
              >
                {f.archived ? (
                  <ArchiveRestore className="size-4" aria-hidden />
                ) : (
                  <Archive className="size-4" aria-hidden />
                )}
              </button>
            </li>
          ))
        )}
      </ul>

      <button
        type="button"
        onClick={() => setView("oneOff")}
        className="text-muted-foreground w-full text-center text-sm underline-offset-2 hover:underline"
      >
        Log a one-off (won&apos;t be saved)
      </button>
    </div>
  );
}
