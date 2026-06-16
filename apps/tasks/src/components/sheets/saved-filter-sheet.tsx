"use client";

import { Check, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useToast } from "@/components/providers/toast-provider";
import {
  useCreateSavedFilter,
  useDeleteSavedFilter,
  useUpdateSavedFilter,
} from "@/hooks/use-saved-filter-mutations";
import { cn } from "@/lib/utils";
import type { SavedFilter } from "@/generated/prisma/client";

const PRESETS = [
  "#808080",
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

/** What the sheet opens for: editing an existing filter, or creating one
 *  (optionally seeded with a query from the freeform screen). */
export interface SavedFilterTarget {
  filter?: SavedFilter;
  query?: string;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

export function SavedFilterSheet({
  target,
  open,
  onOpenChange,
}: {
  target: SavedFilterTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs>
      <DrawerContent
        showHandle={false}
        className="pb-[max(env(safe-area-inset-bottom),1rem)]"
      >
        <DrawerTitle className="px-4 pt-4 pb-1 text-sm font-semibold">
          {target?.filter ? "Edit filter" : "Save filter"}
        </DrawerTitle>
        {/* Keyed so the form re-initializes from `target` on each open/target. */}
        <SavedFilterForm
          key={`${target?.filter?.id ?? "new"}:${target?.query ?? ""}`}
          target={target}
          onDone={() => onOpenChange(false)}
        />
      </DrawerContent>
    </Drawer>
  );
}

function SavedFilterForm({
  target,
  onDone,
}: {
  target: SavedFilterTarget | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const create = useCreateSavedFilter();
  const update = useUpdateSavedFilter();
  const remove = useDeleteSavedFilter();

  const editing = target?.filter;
  const [name, setName] = React.useState(editing?.name ?? "");
  const [query, setQuery] = React.useState(editing?.query ?? target?.query ?? "");
  const [color, setColor] = React.useState(editing?.color ?? PRESETS[0]);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const busy = create.isPending || update.isPending || remove.isPending;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    const trimmedQuery = query.trim();
    if (trimmedName.length === 0 || trimmedQuery.length === 0) return;
    try {
      if (editing) {
        await update.mutateAsync({
          id: editing.id,
          input: { name: trimmedName, query: trimmedQuery, color },
        });
        toast({ message: "Filter saved" });
        onDone();
      } else {
        const created = await create.mutateAsync({
          name: trimmedName,
          query: trimmedQuery,
          color,
        });
        onDone();
        router.push(`/filter/${created.id}`);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleDelete() {
    if (!editing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setError(null);
    try {
      await remove.mutateAsync(editing.id);
      onDone();
      router.push("/browse");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 px-4 pt-2 pb-4">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Filter name"
        aria-label="Filter name"
        maxLength={60}
        className="h-11 w-full rounded-lg bg-muted px-3 text-base outline-none placeholder:text-muted-foreground"
      />
      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="(today | overdue) & #School & !@waiting"
        aria-label="Filter expression"
        rows={2}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={500}
        className="w-full resize-none rounded-lg bg-muted px-3 py-2 font-mono text-sm outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center gap-2" role="radiogroup" aria-label="Color">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            role="radio"
            aria-checked={color === preset}
            aria-label={preset}
            onClick={() => setColor(preset)}
            className={cn(
              "flex size-7 items-center justify-center rounded-full",
              color === preset && "ring-2 ring-offset-2 ring-offset-background",
            )}
            style={{ backgroundColor: preset, color: "#fff" }}
          >
            {color === preset && <Check className="size-4" aria-hidden />}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        {editing ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-destructive active:bg-destructive/10 disabled:opacity-40"
          >
            <Trash2 className="size-4" aria-hidden />
            {confirmDelete ? "Tap to confirm" : "Delete"}
          </button>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={busy || name.trim().length === 0 || query.trim().length === 0}
          className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition active:scale-95 disabled:opacity-40"
        >
          {editing ? "Save" : "Create"}
        </button>
      </div>
    </form>
  );
}
