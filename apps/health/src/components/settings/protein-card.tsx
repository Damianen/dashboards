"use client";

import { Drumstick } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SettingCard } from "@/components/settings/setting-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { queryKeys } from "@/lib/hooks/keys";
import { type SettingHandle, useSetting } from "@/lib/hooks/use-setting";
import { proteinSettingSchema } from "@/lib/schemas/settings";

interface ProteinSettingDTO {
  gPerKg: number;
}

// The protein-target factor (g/kg). Editing it re-derives the Today protein target from the
// latest weight, so we invalidate the adherence queries on save.
export function ProteinTargetCard() {
  const setting = useSetting<ProteinSettingDTO>({
    key: queryKeys.setting("protein"),
    url: "/api/settings/protein",
    invalidateOnSave: [queryKeys.adherencePrefix()],
    successMessage: "Protein target updated",
    errorMessage: "Couldn't update protein target",
  });

  return (
    <SettingCard
      icon={Drumstick}
      title="Protein target"
      description="Grams of protein per kg of bodyweight. Your daily target is this × your most recent weight."
      loadErrorLabel="the current factor"
      setting={setting}
    >
      {(data, s) => <ProteinForm data={data} setting={s} />}
    </SettingCard>
  );
}

function ProteinForm({
  data,
  setting,
}: {
  data: ProteinSettingDTO;
  setting: SettingHandle<ProteinSettingDTO>;
}) {
  const [value, setValue] = useState(String(data.gPerKg));

  function handleSave() {
    const parsed = proteinSettingSchema.safeParse({ gPerKg: value });
    if (!parsed.success) {
      toast.error("Enter a protein factor between 0.1 and 10 g/kg");
      return;
    }
    setting.save({ gPerKg: parsed.data.gPerKg });
  }

  return (
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
          disabled={setting.saving}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <Button onClick={handleSave} disabled={setting.saving}>
        Save
      </Button>
    </div>
  );
}
