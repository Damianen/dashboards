"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BedDouble, ChevronDown, ChevronUp, Repeat, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getJSON, patchJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import { useTemplates } from "@/lib/hooks/use-templates";
import { rotationSchema } from "@/lib/schemas/briefing";
// Type-only import: erased at build time, so no server code is bundled.
import type { RotationEntryView, RotationView } from "@/server/services/rotation";

const iconBtn =
  "flex size-11 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-30";

// The workout rotation: the ordered split the briefing's session suggestion
// walks through (templates + rest days, wrapping around). Editing is local
// until Save — the whole list is replaced in one PATCH.
export function RotationCard() {
  const qc = useQueryClient();
  const [entries, setEntries] = useState<RotationEntryView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const { data: templates } = useTemplates(false);

  // A failed load must NOT render as an empty rotation — saving over it would
  // silently wipe the real one — so it gets an explicit Retry state.
  const fetchRotation = useCallback(() => {
    void getJSON<RotationView>("/api/settings/rotation")
      .then((d) => setEntries(d.entries))
      .catch(() => setLoadError(true))
      .finally(() => setLoaded(true));
  }, []);
  useEffect(fetchRotation, [fetchRotation]);

  function retryLoad() {
    setLoaded(false);
    setLoadError(false);
    fetchRotation();
  }

  function addTemplate(templateId: string) {
    const t = templates?.find((x) => x.id === templateId);
    if (!t) return;
    setEntries((prev) => [
      ...prev,
      { kind: "TEMPLATE", templateId: t.id, templateName: t.name, archived: t.archived },
    ]);
  }

  function addRest() {
    setEntries((prev) => [
      ...prev,
      { kind: "REST", templateId: null, templateName: null, archived: false },
    ]);
  }

  function move(index: number, delta: -1 | 1) {
    setEntries((prev) => {
      const next = [...prev];
      const target = index + delta;
      const a = next[index];
      const b = next[target];
      if (a === undefined || b === undefined) return prev;
      next[index] = b;
      next[target] = a;
      return next;
    });
  }

  function remove(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    const parsed = rotationSchema.safeParse({
      entries: entries.map((e) =>
        e.kind === "REST"
          ? { kind: "REST" as const }
          : { kind: "TEMPLATE" as const, templateId: e.templateId },
      ),
    });
    if (!parsed.success) {
      toast.error("Rotation can hold at most 14 entries");
      return;
    }
    setSaving(true);
    try {
      const d = await patchJSON<RotationView>(
        "/api/settings/rotation",
        parsed.data,
      );
      setEntries(d.entries);
      await qc.invalidateQueries({ queryKey: queryKeys.briefingPrefix() });
      await qc.invalidateQueries({ queryKey: queryKeys.rotation() });
      toast.success("Rotation saved");
    } catch {
      toast.error("Couldn't save the rotation");
    } finally {
      setSaving(false);
    }
  }

  const busy = !loaded || saving;
  const atMax = entries.length >= 14;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Repeat className="size-4" /> Workout rotation
        </CardTitle>
        <CardDescription>
          Your split in training order, rest days included. The briefing
          suggests the entry after your last logged session, wrapping around.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loadError ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              Couldn&apos;t load the current rotation.
            </p>
            <Button variant="outline" onClick={retryLoad}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No rotation yet — add your templates in the order you train.
              </p>
            ) : (
              <ol className="space-y-1">
                {entries.map((e, i) => {
                  const name =
                    e.kind === "REST" ? "Rest day" : (e.templateName ?? "Unknown template");
                  return (
                    // Index keys are fine here: entries can repeat, and every
                    // reorder/remove rebuilds the array anyway.
                    <li key={i} className="flex items-center gap-1">
                      <span className="text-muted-foreground w-5 shrink-0 text-right text-sm tabular-nums">
                        {i + 1}.
                      </span>
                      {e.kind === "REST" && (
                        <BedDouble className="text-muted-foreground size-4 shrink-0" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {name}
                        {e.archived && (
                          <span className="text-muted-foreground ml-1 text-xs">
                            (archived)
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        aria-label={`Move ${name} up`}
                        className={iconBtn}
                        disabled={busy || i === 0}
                        onClick={() => move(i, -1)}
                      >
                        <ChevronUp className="size-5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${name} down`}
                        className={iconBtn}
                        disabled={busy || i === entries.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ChevronDown className="size-5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${name}`}
                        className={iconBtn}
                        disabled={busy}
                        onClick={() => remove(i)}
                      >
                        <X className="size-5" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}

            <div className="flex items-center gap-2">
              {/* key resets the Select after each pick so it reads as an "add" action. */}
              <Select
                key={entries.length}
                onValueChange={addTemplate}
                disabled={busy || atMax || (templates ?? []).length === 0}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Add template…" />
                </SelectTrigger>
                <SelectContent>
                  {(templates ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={addRest}
                disabled={busy || atMax}
              >
                <BedDouble className="size-4" aria-hidden /> Rest
              </Button>
            </div>

            <Button onClick={() => void handleSave()} disabled={busy}>
              Save
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
