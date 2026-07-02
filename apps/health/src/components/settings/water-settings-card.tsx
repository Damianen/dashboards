"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Droplets } from "lucide-react";
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
import { waterSettingsSchema, type WaterSettings } from "@/lib/schemas/settings";

// The two inputs of the deterministic water target (base + stimulant mg ×
// ml-per-mg). The formula itself lives ONLY in the daily_summary view, which
// reads these settings live — so saving + invalidating summary/water moves
// Today's target immediately, past days included.
export function WaterSettingsCard() {
  const qc = useQueryClient();
  const [base, setBase] = useState("");
  const [perMg, setPerMg] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  // A failed load must NOT render as defaults — saving over it would silently
  // overwrite the real settings — so it gets an explicit Retry state.
  const fetchSettings = useCallback(() => {
    void getJSON<WaterSettings>("/api/settings/water")
      .then((d) => {
        setBase(String(d.baseTargetMl));
        setPerMg(String(d.mlPerMgStimulant));
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoaded(true));
  }, []);
  useEffect(fetchSettings, [fetchSettings]);

  function retryLoad() {
    setLoaded(false);
    setLoadError(false);
    fetchSettings();
  }

  async function handleSave() {
    const parsed = waterSettingsSchema.safeParse({
      baseTargetMl: base,
      mlPerMgStimulant: perMg,
    });
    if (!parsed.success) {
      toast.error(
        "Base target must be 500–6000 ml and the stimulant factor 0–5 ml/mg",
      );
      return;
    }
    setSaving(true);
    try {
      const d = await patchJSON<WaterSettings>(
        "/api/settings/water",
        parsed.data,
      );
      setBase(String(d.baseTargetMl));
      setPerMg(String(d.mlPerMgStimulant));
      // The view computes targets live from these settings — refresh every
      // cached day's summary and water status.
      await qc.invalidateQueries({ queryKey: queryKeys.summaryPrefix() });
      await qc.invalidateQueries({ queryKey: queryKeys.waterPrefix() });
      toast.success("Water target updated");
    } catch {
      toast.error("Couldn't update water settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Droplets className="size-4" /> Water target
        </CardTitle>
        <CardDescription>
          Daily target = base + logged stimulant mg × the factor below. Set the
          factor to 0 to ignore stimulants.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loadError ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              Couldn&apos;t load the current settings.
            </p>
            <Button variant="outline" onClick={retryLoad}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="water-base-target">Base (ml)</Label>
              <Input
                id="water-base-target"
                type="number"
                inputMode="numeric"
                min={500}
                max={6000}
                step={100}
                className="w-24"
                value={base}
                disabled={!loaded || saving}
                onChange={(e) => setBase(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="water-ml-per-mg">ml per mg</Label>
              <Input
                id="water-ml-per-mg"
                type="number"
                inputMode="decimal"
                min={0}
                max={5}
                step={0.1}
                className="w-24"
                value={perMg}
                disabled={!loaded || saving}
                onChange={(e) => setPerMg(e.target.value)}
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
