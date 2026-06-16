"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogStimulant } from "@/lib/hooks/use-log-stimulant";
import { logStimulantSchema } from "@/lib/schemas/stimulant";

const PRESETS_MG = [100, 200] as const;

export function StimulantForm({
  day,
  onLogged,
}: {
  day: string;
  onLogged: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [substance, setSubstance] = useState("caffeine");
  const { mutate, isPending } = useLogStimulant(day);

  function log(amountMg: number, sub: string) {
    const parsed = logStimulantSchema.safeParse({
      amountMg,
      substance: sub.trim() || "caffeine",
    });
    if (!parsed.success) {
      toast.error("Enter a valid dose (1–2000 mg)");
      return;
    }
    mutate(parsed.data, { onSuccess: () => onLogged() });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {PRESETS_MG.map((mg) => (
          <Button
            key={mg}
            variant="secondary"
            className="h-12 text-base"
            disabled={isPending}
            onClick={() => log(mg, "caffeine")}
          >
            {mg} mg caffeine
          </Button>
        ))}
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          log(Number(amount), substance);
          setAmount("");
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="stim-amount">Amount</Label>
            <Input
              id="stim-amount"
              type="number"
              inputMode="numeric"
              min={1}
              max={2000}
              placeholder="mg"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stim-substance">Substance</Label>
            <Input
              id="stim-substance"
              value={substance}
              onChange={(e) => setSubstance(e.target.value)}
            />
          </div>
        </div>
        <Button
          type="submit"
          className="h-12 w-full"
          disabled={isPending || amount === ""}
        >
          Log stimulant
        </Button>
      </form>
    </div>
  );
}
