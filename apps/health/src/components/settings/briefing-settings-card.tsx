"use client";

import { CalendarClock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SettingCard } from "@/components/settings/setting-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { queryKeys } from "@/lib/hooks/keys";
import { type SettingHandle, useSetting } from "@/lib/hooks/use-setting";
import {
  briefingSettingsSchema,
  type BriefingSettings,
} from "@/lib/schemas/briefing";

type Toggle = "on" | "off";

const TOGGLE_OPTIONS: { value: Toggle; label: string }[] = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

/** One notification slot row: enable toggle + wall-clock time. */
function SlotField({
  id,
  label,
  enabled,
  time,
  disabled,
  onEnabledChange,
  onTimeChange,
}: {
  id: string;
  label: string;
  enabled: Toggle;
  time: string;
  disabled: boolean;
  onEnabledChange: (v: Toggle) => void;
  onTimeChange: (v: string) => void;
}) {
  return (
    <div className="flex items-end gap-3">
      <div className="flex-1 space-y-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          type="time"
          value={time}
          disabled={disabled || enabled === "off"}
          onChange={(e) => onTimeChange(e.target.value)}
        />
      </div>
      <Segmented<Toggle>
        value={enabled}
        onChange={onEnabledChange}
        options={TOGGLE_OPTIONS}
        ariaLabel={`${label} on or off`}
        size="sm"
        className="w-28 shrink-0"
      />
    </div>
  );
}

// The daily-briefing knobs: the two push slots (times are Europe/Amsterdam,
// each fires at most once per day), the hour the card flips to evening mode,
// and the readiness bands behind the session suggestion (used when the
// recovery baseline is insufficient). The suggestion is advisory only.
export function BriefingSettingsCard() {
  const setting = useSetting<BriefingSettings>({
    key: queryKeys.setting("briefing"),
    url: "/api/settings/briefing",
    invalidateOnSave: [queryKeys.briefingPrefix()],
    successMessage: "Briefing settings updated",
    errorMessage: "Couldn't update briefing settings",
  });

  return (
    <SettingCard
      icon={CalendarClock}
      title="Daily briefing"
      description="Push times are Europe/Amsterdam; each slot fires at most once per day. The readiness bands steer the session suggestion — an advisory heuristic, never medical advice."
      loadErrorLabel="the current settings"
      setting={setting}
    >
      {(data, s) => <BriefingSettingsForm data={data} setting={s} />}
    </SettingCard>
  );
}

function BriefingSettingsForm({
  data,
  setting,
}: {
  data: BriefingSettings;
  setting: SettingHandle<BriefingSettings>;
}) {
  // API shape → form fields; the submit handler maps them back.
  const [morningEnabled, setMorningEnabled] = useState<Toggle>(
    data.morning.enabled ? "on" : "off",
  );
  const [morningTime, setMorningTime] = useState(data.morning.time);
  const [eveningEnabled, setEveningEnabled] = useState<Toggle>(
    data.evening.enabled ? "on" : "off",
  );
  const [eveningTime, setEveningTime] = useState(data.evening.time);
  const [cutoff, setCutoff] = useState(String(data.modeCutoffHour));
  const [goodMin, setGoodMin] = useState(String(data.thresholds.goodMin));
  const [moderateMin, setModerateMin] = useState(
    String(data.thresholds.moderateMin),
  );

  function handleSave() {
    const parsed = briefingSettingsSchema.safeParse({
      morning: { enabled: morningEnabled === "on", time: morningTime },
      evening: { enabled: eveningEnabled === "on", time: eveningTime },
      modeCutoffHour: cutoff,
      thresholds: { goodMin, moderateMin },
    });
    if (!parsed.success) {
      toast.error(
        "Times must be HH:MM, the cutoff 0–23, and thresholds 1–100 with moderate below good",
      );
      return;
    }
    setting.save(parsed.data);
  }

  return (
    <div className="space-y-4">
      <SlotField
        id="briefing-morning-time"
        label="Morning push"
        enabled={morningEnabled}
        time={morningTime}
        disabled={setting.saving}
        onEnabledChange={setMorningEnabled}
        onTimeChange={setMorningTime}
      />
      <SlotField
        id="briefing-evening-time"
        label="Evening push"
        enabled={eveningEnabled}
        time={eveningTime}
        disabled={setting.saving}
        onEnabledChange={setEveningEnabled}
        onTimeChange={setEveningTime}
      />
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="briefing-cutoff">Evening mode from (hour)</Label>
          <Input
            id="briefing-cutoff"
            type="number"
            inputMode="numeric"
            min={0}
            max={23}
            className="w-24"
            value={cutoff}
            disabled={setting.saving}
            onChange={(e) => setCutoff(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="briefing-good-min">Readiness good ≥</Label>
          <Input
            id="briefing-good-min"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            className="w-24"
            value={goodMin}
            disabled={setting.saving}
            onChange={(e) => setGoodMin(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="briefing-moderate-min">Moderate ≥</Label>
          <Input
            id="briefing-moderate-min"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            className="w-24"
            value={moderateMin}
            disabled={setting.saving}
            onChange={(e) => setModerateMin(e.target.value)}
          />
        </div>
      </div>
      <Button onClick={handleSave} disabled={setting.saving}>
        Save
      </Button>
    </div>
  );
}
