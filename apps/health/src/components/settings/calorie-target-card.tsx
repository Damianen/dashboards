"use client";

import { Flame } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SettingCard } from "@/components/settings/setting-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { queryKeys } from "@/lib/hooks/keys";
import { type SettingHandle, useSetting } from "@/lib/hooks/use-setting";
import { intakeTargetSchema } from "@/lib/schemas/settings";

interface IntakeTargetDTO {
  kcal: number | null;
}

// Daily intake calorie target. An intake-ONLY goal shown against logged calories — never
// a deficit or an expenditure figure (CLAUDE.md no-net-calories guardrail). Saving
// invalidates adherence so Today's intake progress refreshes. Empty until set.
export function CalorieTargetCard() {
  const setting = useSetting<IntakeTargetDTO>({
    key: queryKeys.setting("intake-target"),
    url: "/api/settings/intake-target",
    invalidateOnSave: [queryKeys.adherencePrefix()],
    successMessage: "Calorie target updated",
    errorMessage: "Couldn't update calorie target",
  });

  return (
    <SettingCard
      icon={Flame}
      title="Calorie target"
      description="A daily intake goal, shown against the calories you log. It is never a deficit or expenditure target."
      loadErrorLabel="the current target"
      setting={setting}
    >
      {(data, s) => <CalorieTargetForm data={data} setting={s} />}
    </SettingCard>
  );
}

function CalorieTargetForm({
  data,
  setting,
}: {
  data: IntakeTargetDTO;
  setting: SettingHandle<IntakeTargetDTO>;
}) {
  const [value, setValue] = useState(data.kcal == null ? "" : String(data.kcal));

  function handleSave() {
    const parsed = intakeTargetSchema.safeParse({ kcal: value });
    if (!parsed.success) {
      toast.error("Enter a calorie target between 500 and 10000 kcal");
      return;
    }
    setting.save({ kcal: parsed.data.kcal });
  }

  return (
    <div className="flex items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="intake-kcal-target">kcal</Label>
        <Input
          id="intake-kcal-target"
          type="number"
          inputMode="numeric"
          min={500}
          max={10000}
          step={10}
          placeholder="e.g. 2200"
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
