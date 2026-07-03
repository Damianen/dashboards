"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
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
import { Segmented } from "@/components/ui/segmented";
import { getJSON, patchJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
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
  const qc = useQueryClient();
  const [morningEnabled, setMorningEnabled] = useState<Toggle>("on");
  const [morningTime, setMorningTime] = useState("07:30");
  const [eveningEnabled, setEveningEnabled] = useState<Toggle>("on");
  const [eveningTime, setEveningTime] = useState("21:00");
  const [cutoff, setCutoff] = useState("15");
  const [goodMin, setGoodMin] = useState("75");
  const [moderateMin, setModerateMin] = useState("60");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  // A failed load must NOT render as defaults — saving over it would silently
  // overwrite the real settings — so it gets an explicit Retry state.
  const fetchSettings = useCallback(() => {
    void getJSON<BriefingSettings>("/api/settings/briefing")
      .then((d) => {
        setMorningEnabled(d.morning.enabled ? "on" : "off");
        setMorningTime(d.morning.time);
        setEveningEnabled(d.evening.enabled ? "on" : "off");
        setEveningTime(d.evening.time);
        setCutoff(String(d.modeCutoffHour));
        setGoodMin(String(d.thresholds.goodMin));
        setModerateMin(String(d.thresholds.moderateMin));
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
    setSaving(true);
    try {
      const d = await patchJSON<BriefingSettings>(
        "/api/settings/briefing",
        parsed.data,
      );
      setMorningEnabled(d.morning.enabled ? "on" : "off");
      setMorningTime(d.morning.time);
      setEveningEnabled(d.evening.enabled ? "on" : "off");
      setEveningTime(d.evening.time);
      setCutoff(String(d.modeCutoffHour));
      setGoodMin(String(d.thresholds.goodMin));
      setModerateMin(String(d.thresholds.moderateMin));
      await qc.invalidateQueries({ queryKey: queryKeys.briefingPrefix() });
      toast.success("Briefing settings updated");
    } catch {
      toast.error("Couldn't update briefing settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-4" /> Daily briefing
        </CardTitle>
        <CardDescription>
          Push times are Europe/Amsterdam; each slot fires at most once per day.
          The readiness bands steer the session suggestion — an advisory
          heuristic, never medical advice.
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
          <div className="space-y-4">
            <SlotField
              id="briefing-morning-time"
              label="Morning push"
              enabled={morningEnabled}
              time={morningTime}
              disabled={!loaded || saving}
              onEnabledChange={setMorningEnabled}
              onTimeChange={setMorningTime}
            />
            <SlotField
              id="briefing-evening-time"
              label="Evening push"
              enabled={eveningEnabled}
              time={eveningTime}
              disabled={!loaded || saving}
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
                  disabled={!loaded || saving}
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
                  disabled={!loaded || saving}
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
                  disabled={!loaded || saving}
                  onChange={(e) => setModerateMin(e.target.value)}
                />
              </div>
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
