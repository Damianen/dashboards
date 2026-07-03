"use client";

import { Droplets } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SettingCard } from "@/components/settings/setting-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { queryKeys } from "@/lib/hooks/keys";
import { type SettingHandle, useSetting } from "@/lib/hooks/use-setting";
import { waterSettingsSchema, type WaterSettings } from "@/lib/schemas/settings";

// The two inputs of the deterministic water target (base + stimulant mg ×
// ml-per-mg). The formula itself lives ONLY in the daily_summary view, which
// reads these settings live — so saving + invalidating summary/water moves
// Today's target immediately, past days included.
export function WaterSettingsCard() {
  const setting = useSetting<WaterSettings>({
    key: queryKeys.setting("water"),
    url: "/api/settings/water",
    // The view computes targets live from these settings — refresh every
    // cached day's summary and water status.
    invalidateOnSave: [queryKeys.summaryPrefix(), queryKeys.waterPrefix()],
    successMessage: "Water target updated",
    errorMessage: "Couldn't update water settings",
  });

  return (
    <SettingCard
      icon={Droplets}
      title="Water target"
      description="Daily target = base + logged stimulant mg × the factor below. Set the factor to 0 to ignore stimulants."
      loadErrorLabel="the current settings"
      setting={setting}
    >
      {(data, s) => <WaterSettingsForm data={data} setting={s} />}
    </SettingCard>
  );
}

function WaterSettingsForm({
  data,
  setting,
}: {
  data: WaterSettings;
  setting: SettingHandle<WaterSettings>;
}) {
  const [base, setBase] = useState(String(data.baseTargetMl));
  const [perMg, setPerMg] = useState(String(data.mlPerMgStimulant));

  function handleSave() {
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
    setting.save(parsed.data);
  }

  return (
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
          disabled={setting.saving}
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
          disabled={setting.saving}
          onChange={(e) => setPerMg(e.target.value)}
        />
      </div>
      <Button onClick={handleSave} disabled={setting.saving}>
        Save
      </Button>
    </div>
  );
}
