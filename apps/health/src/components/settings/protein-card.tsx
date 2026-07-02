"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Drumstick } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getJSON, patchJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import { proteinSettingSchema } from "@/lib/schemas/settings";

// The protein-target factor (g/kg). Editing it re-derives the Today protein target from the
// latest weight, so we invalidate the adherence queries on save.
export function ProteinTargetCard() {
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  // A failed load must NOT render as an empty field — saving over it would
  // silently overwrite the real factor — so it gets an explicit Retry state.
  const fetchFactor = useCallback(() => {
    void getJSON<{ gPerKg: number }>("/api/settings/protein")
      .then((d) => setValue(String(d.gPerKg)))
      .catch(() => setLoadError(true))
      .finally(() => setLoaded(true));
  }, []);
  useEffect(fetchFactor, [fetchFactor]);

  function retryLoad() {
    setLoaded(false);
    setLoadError(false);
    fetchFactor();
  }

  async function handleSave() {
    const parsed = proteinSettingSchema.safeParse({ gPerKg: value });
    if (!parsed.success) {
      toast.error("Enter a protein factor between 0.1 and 10 g/kg");
      return;
    }
    setSaving(true);
    try {
      const d = await patchJSON<{ gPerKg: number }>("/api/settings/protein", {
        gPerKg: parsed.data.gPerKg,
      });
      setValue(String(d.gPerKg));
      await qc.invalidateQueries({ queryKey: queryKeys.adherencePrefix() });
      toast.success("Protein target updated");
    } catch {
      toast.error("Couldn't update protein target");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Drumstick className="size-4" /> Protein target
        </CardTitle>
        <CardDescription>
          Grams of protein per kg of bodyweight. Your daily target is this ×
          your most recent weight.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loadError ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              Couldn&apos;t load the current factor.
            </p>
            <Button variant="outline" onClick={retryLoad}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="protein-g-per-kg">g/kg</Label>
              <Input
                id="protein-g-per-kg"
                type="number"
                inputMode="decimal"
                min={0.1}
                max={10}
                step={0.1}
                className="w-28"
                value={value}
                disabled={!loaded || saving}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <Button onClick={() => void handleSave()} disabled={!loaded || saving}>
              Save
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
