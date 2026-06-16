"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogWater } from "@/lib/hooks/use-log-water";
import { useWaterStatus } from "@/lib/hooks/use-water-status";
import { logWaterSchema } from "@/lib/schemas/water";

const PRESETS_ML = [250, 500, 750] as const;

export function WaterForm({
  day,
  onLogged,
}: {
  day: string;
  onLogged: () => void;
}) {
  const [custom, setCustom] = useState("");
  const { mutate, isPending } = useLogWater(day);
  const status = useWaterStatus(day);

  function log(amountMl: number) {
    const parsed = logWaterSchema.safeParse({ amountMl });
    if (!parsed.success) {
      toast.error("Enter a valid amount (1–5000 ml)");
      return;
    }
    mutate(parsed.data, { onSuccess: () => onLogged() });
  }

  return (
    <div className="space-y-4">
      {status.data && (
        <p className="text-muted-foreground text-sm">
          {status.data.waterMl} / {status.data.targetMl} ml ·{" "}
          {status.data.remainingMl} ml to go
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        {PRESETS_ML.map((ml) => (
          <Button
            key={ml}
            variant="secondary"
            className="h-12 text-base"
            disabled={isPending}
            onClick={() => log(ml)}
          >
            {ml} ml
          </Button>
        ))}
      </div>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          log(Number(custom));
          setCustom("");
        }}
      >
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="water-custom">Custom amount</Label>
          <Input
            id="water-custom"
            type="number"
            inputMode="numeric"
            min={1}
            max={5000}
            placeholder="ml"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          className="h-12"
          disabled={isPending || custom === ""}
        >
          Log
        </Button>
      </form>
    </div>
  );
}
