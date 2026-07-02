"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Stepper } from "@/components/ui/stepper";
import { useLogWeight } from "@/lib/hooks/use-log-weight";
import { useSummary } from "@/lib/hooks/use-summary";
import { logWeightSchema } from "@/lib/schemas/weight";

export function WeightForm({
  day,
  onLogged,
}: {
  day: string;
  onLogged: () => void;
}) {
  const { data: summary } = useSummary(day);
  // Local edits win; until the first edit the field tracks the live prefill
  // (today's weight, else the 7-day average) — no effect needed.
  const [local, setLocal] = useState<number | null>(null);
  const prefill = summary?.weightKg ?? summary?.weight7dAvg ?? 80;
  const value = local ?? Math.round(prefill * 10) / 10;
  const { mutate, isPending } = useLogWeight(day);

  function save() {
    const parsed = logWeightSchema.safeParse({ weightKg: value });
    if (!parsed.success) {
      toast.error("Enter a valid weight (20–350 kg)");
      return;
    }
    mutate(parsed.data, { onSuccess: () => onLogged() });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="weight-kg">Weight (kg)</Label>
        <Stepper
          id="weight-kg"
          label="weight"
          value={value}
          onChange={setLocal}
          step={0.1}
          min={20}
          max={350}
          inputMode="decimal"
        />
        <p className="text-muted-foreground text-[10px]">
          Saved as a manual weigh-in alongside your Withings measurements.
        </p>
      </div>

      <Button
        type="button"
        className="h-12 w-full text-base"
        onClick={save}
        disabled={isPending}
      >
        Log weight
      </Button>
    </div>
  );
}
