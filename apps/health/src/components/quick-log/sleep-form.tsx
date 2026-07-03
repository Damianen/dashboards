"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { Stepper } from "@/components/ui/stepper";
import { shiftDay } from "@/lib/dates";
import { formatHm } from "@/lib/format";
import { useLogSleep } from "@/lib/hooks/use-log-sleep";

type Mode = "times" | "duration";

const MODES: SegmentedOption<Mode>[] = [
  { value: "times", label: "Times" },
  { value: "duration", label: "Duration" },
];

/**
 * Manual sleep entry sheet (the Oura-outage fallback) for `day` — TODAY's
 * civil date, whose wake morning the entry belongs to.
 *
 * Time→datetime rule (Times mode): the END time-of-day is on `day` itself
 * (you woke this morning); the START time-of-day is on the evening BEFORE
 * (shiftDay(day, -1)) when start ≥ end — the usual crossed-midnight night —
 * and on `day` when start < end (fell asleep after midnight). Both wall
 * times are read in the device's local clock and converted to instants, so
 * the span is true elapsed time even across a DST switch.
 */
export function SleepForm({
  day,
  onLogged,
}: {
  day: string;
  onLogged: () => void;
}) {
  const [mode, setMode] = useState<Mode>("times");
  const [start, setStart] = useState("23:30");
  const [end, setEnd] = useState("07:30");
  const [durationMin, setDurationMin] = useState(450);
  const { mutate, isPending } = useLogSleep(day);

  function save() {
    if (mode === "duration") {
      // "Slept 7h30, woke just now" — the service defaults the end to now.
      mutate({ durationMin }, { onSuccess: () => onLogged() });
      return;
    }
    if (!start || !end) {
      toast.error("Enter both bedtimes");
      return;
    }
    // <input type="time"> yields zero-padded "HH:mm", so start ≥ end compares
    // lexicographically (the lib/dates.ts slot-time idiom).
    const startDay = start >= end ? shiftDay(day, -1) : day;
    mutate(
      {
        bedtimeStart: new Date(`${startDay}T${start}:00`).toISOString(),
        bedtimeEnd: new Date(`${day}T${end}:00`).toISOString(),
      },
      { onSuccess: () => onLogged() },
    );
  }

  return (
    <div className="space-y-4">
      <Segmented<Mode>
        value={mode}
        onChange={setMode}
        options={MODES}
        ariaLabel="How to enter sleep"
      />

      {mode === "times" ? (
        <div className="flex gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="sleep-start">Bedtime</Label>
            <Input
              id="sleep-start"
              type="time"
              className="h-11"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="sleep-end">Woke up</Label>
            <Input
              id="sleep-end"
              type="time"
              className="h-11"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="sleep-duration">Time asleep (minutes)</Label>
          <Stepper
            id="sleep-duration"
            label="minutes asleep"
            value={durationMin}
            onChange={setDurationMin}
            step={15}
            min={15}
            max={1440}
          />
          <p className="text-muted-foreground text-xs tabular-nums">
            {formatHm(durationMin)} h — counted back from now.
          </p>
        </div>
      )}

      <p className="text-muted-foreground text-[10px]">
        Manual fallback for nights Oura missed — no sleep score, duration only.
      </p>

      <Button
        type="button"
        className="h-12 w-full text-base"
        onClick={save}
        disabled={isPending}
      >
        {isPending ? "Saving…" : "Save sleep"}
      </Button>
    </div>
  );
}
