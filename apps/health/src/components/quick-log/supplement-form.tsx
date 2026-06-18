"use client";

import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLogSupplement } from "@/lib/hooks/use-log-supplement";
import { useSupplementNames } from "@/lib/hooks/use-supplement-names";
import { logSupplementSchema } from "@/lib/schemas/supplement";

const UNITS = ["mg", "mcg", "g", "IU", "ml", "capsule", "tablet", "drop"];

export function SupplementForm({
  day,
  onLogged,
}: {
  day: string;
  onLogged: () => void;
}) {
  const listId = useId();
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [unit, setUnit] = useState("mg");
  const names = useSupplementNames();
  const { mutate, isPending } = useLogSupplement(day);

  function submit() {
    const parsed = logSupplementSchema.safeParse({
      name,
      dose: Number(dose),
      unit,
    });
    if (!parsed.success) {
      toast.error("Enter a name, dose, and unit");
      return;
    }
    mutate(parsed.data, {
      onSuccess: () => {
        setName("");
        setDose("");
        onLogged();
      },
    });
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="supp-name">Name</Label>
        <Input
          id="supp-name"
          list={listId}
          placeholder="e.g. Creatine"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
        <datalist id={listId}>
          {names.data?.map((n) => <option key={n} value={n} />)}
        </datalist>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="supp-dose">Dose</Label>
          <Input
            id="supp-dose"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            placeholder="amount"
            value={dose}
            onChange={(e) => setDose(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="supp-unit">Unit</Label>
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger id="supp-unit" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        type="submit"
        className="h-12 w-full"
        disabled={isPending || name === "" || dose === ""}
      >
        Log supplement
      </Button>
    </form>
  );
}
