"use client";

import { Target } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SettingCard } from "@/components/settings/setting-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { queryKeys } from "@/lib/hooks/keys";
import { type SettingHandle, useSetting } from "@/lib/hooks/use-setting";
import { weightGoalSchema } from "@/lib/schemas/settings";

interface WeightGoalDTO {
  goalKg: number | null;
}

// Goal body weight. Saving re-derives the projection on the Trends weight card, so we
// invalidate the weight-goal query on save. Empty until the user sets one.
export function WeightGoalCard() {
  const setting = useSetting<WeightGoalDTO>({
    key: queryKeys.setting("weight-goal"),
    url: "/api/settings/weight-goal",
    invalidateOnSave: [queryKeys.weightGoal()],
    successMessage: "Weight goal updated",
    errorMessage: "Couldn't update weight goal",
  });

  return (
    <SettingCard
      icon={Target}
      title="Weight goal"
      description="Your target body weight. The Trends weight chart projects an ETA from your measured trend."
      loadErrorLabel="the current goal"
      setting={setting}
    >
      {(data, s) => <WeightGoalForm data={data} setting={s} />}
    </SettingCard>
  );
}

function WeightGoalForm({
  data,
  setting,
}: {
  data: WeightGoalDTO;
  setting: SettingHandle<WeightGoalDTO>;
}) {
  const [value, setValue] = useState(
    data.goalKg == null ? "" : String(data.goalKg),
  );

  function handleSave() {
    const parsed = weightGoalSchema.safeParse({ goalKg: value });
    if (!parsed.success) {
      toast.error("Enter a goal weight between 20 and 500 kg");
      return;
    }
    setting.save({ goalKg: parsed.data.goalKg });
  }

  return (
    <div className="flex items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="weight-goal-kg">kg</Label>
        <Input
          id="weight-goal-kg"
          type="number"
          inputMode="decimal"
          min={20}
          max={500}
          step={0.1}
          placeholder="e.g. 75"
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
