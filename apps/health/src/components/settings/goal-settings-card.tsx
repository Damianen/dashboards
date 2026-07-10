"use client";

import { Crosshair } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SettingCard } from "@/components/settings/setting-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { queryKeys } from "@/lib/hooks/keys";
import { type SettingHandle, useSetting } from "@/lib/hooks/use-setting";
import { goalSettingsSchema, type GoalSettings } from "@/lib/schemas/settings";

type Toggle = "on" | "off";

const TOGGLE_OPTIONS: { value: Toggle; label: string }[] = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

function NumberField({
  id,
  label,
  value,
  onChange,
  disabled,
  step,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  step: number;
}) {
  return (
    <div className="flex-1 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// The goal-feature knobs. The BW-rate caps bind the target DATE (an aggressive
// date clamps to the cap); the floor is absolute; the weekly cap bounds each
// check-in adjustment; the per-phase protein factors feed the adherence target
// while a goal is active. The 25%-deficit/20%-surplus TDEE bounds are fixed.
export function GoalSettingsCard() {
  const setting = useSetting<GoalSettings>({
    key: queryKeys.setting("goals"),
    url: "/api/settings/goals",
    // New caps/factors re-derive the goal plan and the adherence targets.
    invalidateOnSave: [queryKeys.goal(), queryKeys.adherencePrefix()],
    successMessage: "Goal settings updated",
    errorMessage: "Couldn't update goal settings",
  });

  return (
    <SettingCard
      icon={Crosshair}
      title="Goal targets"
      description="Safety caps and the weekly check-in for the goal-based calorie target — derived from your measured TDEE and weight trend, never device calories."
      loadErrorLabel="the current goal settings"
      setting={setting}
    >
      {(data, s) => <GoalSettingsForm data={data} setting={s} />}
    </SettingCard>
  );
}

function GoalSettingsForm({
  data,
  setting,
}: {
  data: GoalSettings;
  setting: SettingHandle<GoalSettings>;
}) {
  const [maxLoss, setMaxLoss] = useState(String(data.maxLossPctBwPerWeek));
  const [maxGain, setMaxGain] = useState(String(data.maxGainPctBwPerWeek));
  const [floor, setFloor] = useState(String(data.floorKcal));
  const [cap, setCap] = useState(String(data.adjustmentCapKcal));
  const [autoApply, setAutoApply] = useState<Toggle>(
    data.autoApplyCheckIns ? "on" : "off",
  );
  const [cut, setCut] = useState(String(data.proteinGPerKg.cut));
  const [maintain, setMaintain] = useState(String(data.proteinGPerKg.maintain));
  const [bulk, setBulk] = useState(String(data.proteinGPerKg.bulk));

  function handleSave() {
    const parsed = goalSettingsSchema.safeParse({
      maxLossPctBwPerWeek: maxLoss,
      maxGainPctBwPerWeek: maxGain,
      floorKcal: floor,
      adjustmentCapKcal: cap,
      autoApplyCheckIns: autoApply === "on",
      proteinGPerKg: { cut, maintain, bulk },
    });
    if (!parsed.success) {
      toast.error("Check the goal settings — a value is out of bounds");
      return;
    }
    setting.save(parsed.data);
  }

  const busy = setting.saving;
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <NumberField
          id="goal-max-loss"
          label="Max loss (% BW/wk)"
          value={maxLoss}
          onChange={setMaxLoss}
          disabled={busy}
          step={0.05}
        />
        <NumberField
          id="goal-max-gain"
          label="Max gain (% BW/wk)"
          value={maxGain}
          onChange={setMaxGain}
          disabled={busy}
          step={0.05}
        />
      </div>
      <div className="flex gap-3">
        <NumberField
          id="goal-floor"
          label="Floor (kcal)"
          value={floor}
          onChange={setFloor}
          disabled={busy}
          step={50}
        />
        <NumberField
          id="goal-adjustment-cap"
          label="Weekly cap (kcal)"
          value={cap}
          onChange={setCap}
          disabled={busy}
          step={10}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Protein g/kg — cut / maintain / bulk</Label>
        <div className="flex gap-3">
          <Input
            aria-label="Protein g/kg on a cut"
            type="number"
            inputMode="decimal"
            step={0.1}
            value={cut}
            disabled={busy}
            onChange={(e) => setCut(e.target.value)}
          />
          <Input
            aria-label="Protein g/kg on maintain"
            type="number"
            inputMode="decimal"
            step={0.1}
            value={maintain}
            disabled={busy}
            onChange={(e) => setMaintain(e.target.value)}
          />
          <Input
            aria-label="Protein g/kg on a bulk"
            type="number"
            inputMode="decimal"
            step={0.1}
            value={bulk}
            disabled={busy}
            onChange={(e) => setBulk(e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-1.5">
          <Label>Auto-apply weekly check-ins</Label>
          <Segmented<Toggle>
            value={autoApply}
            onChange={setAutoApply}
            options={TOGGLE_OPTIONS}
            ariaLabel="Auto-apply weekly check-ins"
            size="sm"
            className="w-28"
          />
        </div>
        <Button onClick={handleSave} disabled={busy}>
          Save
        </Button>
      </div>
    </div>
  );
}
