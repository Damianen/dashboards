"use client";

import { useState } from "react";
import { toast } from "sonner";

import { useFoodDialogDirty } from "@/components/food/food-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CustomFoodDTO } from "@/lib/food";
import {
  type CreateCustomFoodInput,
  type UpdateCustomFoodInput,
  updateCustomFoodSchema,
} from "@/lib/schemas/food";

function str(n: number | null | undefined): string {
  return n != null ? String(n) : "";
}

/**
 * Per-100 g create/edit form for a saved custom food — the manual sibling of the label
 * scanner's review form. The four energy macros are required, the rest optional; macros
 * are stored verbatim per 100 g and scaled to grams when logged. On create it offers
 * "Save" (adds to My Foods) and "Save & log" (then pick a portion); on edit, "Save
 * changes". Editing never rewrites past diary entries (they snapshot their macros).
 */
export function CustomFoodForm({
  mode,
  initial,
  busy,
  onCreate,
  onUpdate,
}: {
  mode: "create" | "edit";
  initial?: CustomFoodDTO;
  busy: boolean;
  onCreate?: (input: CreateCustomFoodInput, thenLog: boolean) => void;
  onUpdate?: (input: UpdateCustomFoodInput) => void;
}) {
  const p = initial?.per100g;
  const [name, setName] = useState(initial?.name ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [serving, setServing] = useState(str(initial?.servingG));
  const [kcal, setKcal] = useState(str(p?.kcal));
  const [protein, setProtein] = useState(str(p?.proteinG));
  const [carb, setCarb] = useState(str(p?.carbG));
  const [fat, setFat] = useState(str(p?.fatG));
  const [fiber, setFiber] = useState(str(p?.fiberG));
  const [sugar, setSugar] = useState(str(p?.sugarG));
  const [salt, setSalt] = useState(str(p?.saltG));
  const [caffeine, setCaffeine] = useState(str(p?.caffeineMg));

  // Each field against the same seed it started from: on create that is the
  // any-field-filled test, on edit the any-field-changed test.
  useFoodDialogDirty(
    name !== (initial?.name ?? "") ||
      brand !== (initial?.brand ?? "") ||
      serving !== str(initial?.servingG) ||
      kcal !== str(p?.kcal) ||
      protein !== str(p?.proteinG) ||
      carb !== str(p?.carbG) ||
      fat !== str(p?.fatG) ||
      fiber !== str(p?.fiberG) ||
      sugar !== str(p?.sugarG) ||
      salt !== str(p?.saltG) ||
      caffeine !== str(p?.caffeineMg),
  );

  /** Build the validated core fields (no `source`, which create adds and edit omits). */
  function buildCore(): UpdateCustomFoodInput | null {
    if (
      name.trim() === "" ||
      [kcal, protein, carb, fat].some((v) => v.trim() === "")
    ) {
      toast.error("Name and per-100 g kcal/protein/carbs/fat are required");
      return null;
    }
    const candidate = {
      name: name.trim(),
      ...(brand.trim() !== "" ? { brand: brand.trim() } : {}),
      per100g: {
        kcal: Number(kcal),
        proteinG: Number(protein),
        carbG: Number(carb),
        fatG: Number(fat),
        ...(fiber.trim() !== "" ? { fiberG: Number(fiber) } : {}),
        ...(sugar.trim() !== "" ? { sugarG: Number(sugar) } : {}),
        ...(salt.trim() !== "" ? { saltG: Number(salt) } : {}),
        ...(caffeine.trim() !== "" ? { caffeineMg: Number(caffeine) } : {}),
      },
      ...(serving.trim() !== "" ? { servingG: Number(serving) } : {}),
    };
    const parsed = updateCustomFoodSchema.safeParse(candidate);
    if (!parsed.success) {
      toast.error("Those numbers don't look right — please check them");
      return null;
    }
    return parsed.data;
  }

  function submit(thenLog: boolean) {
    const core = buildCore();
    if (!core) return;
    if (mode === "create") onCreate?.({ ...core, source: "MANUAL" }, thenLog);
    else onUpdate?.(core);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="cf-name">Name</Label>
        <Input
          id="cf-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Homemade granola"
          autoFocus={mode === "create"}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="cf-brand">Brand</Label>
          <Input
            id="cf-brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="opt."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-serving">Serving (g)</Label>
          <Input
            id="cf-serving"
            type="number"
            inputMode="decimal"
            min={0}
            value={serving}
            onChange={(e) => setServing(e.target.value)}
            placeholder="opt."
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cf-kcal">Calories per 100 g (kcal)</Label>
        <Input
          id="cf-kcal"
          type="number"
          inputMode="numeric"
          min={0}
          value={kcal}
          onChange={(e) => setKcal(e.target.value)}
          placeholder="kcal"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="cf-protein">Protein (g)</Label>
          <Input
            id="cf-protein"
            type="number"
            inputMode="decimal"
            min={0}
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-carb">Carbs (g)</Label>
          <Input
            id="cf-carb"
            type="number"
            inputMode="decimal"
            min={0}
            value={carb}
            onChange={(e) => setCarb(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-fat">Fat (g)</Label>
          <Input
            id="cf-fat"
            type="number"
            inputMode="decimal"
            min={0}
            value={fat}
            onChange={(e) => setFat(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="cf-fiber">Fiber (g)</Label>
          <Input
            id="cf-fiber"
            type="number"
            inputMode="decimal"
            min={0}
            value={fiber}
            onChange={(e) => setFiber(e.target.value)}
            placeholder="opt."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-sugar">Sugar (g)</Label>
          <Input
            id="cf-sugar"
            type="number"
            inputMode="decimal"
            min={0}
            value={sugar}
            onChange={(e) => setSugar(e.target.value)}
            placeholder="opt."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-salt">Salt (g)</Label>
          <Input
            id="cf-salt"
            type="number"
            inputMode="decimal"
            min={0}
            value={salt}
            onChange={(e) => setSalt(e.target.value)}
            placeholder="opt."
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cf-caffeine">Caffeine per 100 g (mg)</Label>
        <Input
          id="cf-caffeine"
          type="number"
          inputMode="decimal"
          min={0}
          value={caffeine}
          onChange={(e) => setCaffeine(e.target.value)}
          placeholder="opt."
        />
      </div>

      <div className="text-muted-foreground text-[10px] uppercase">
        Macros are per 100 g — logging scales them to your portion.
      </div>

      {mode === "create" ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            className="h-12 text-base"
            onClick={() => submit(false)}
            disabled={busy}
          >
            Save
          </Button>
          <Button
            type="button"
            className="h-12 text-base"
            onClick={() => submit(true)}
            disabled={busy}
          >
            Save &amp; log
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          className="h-12 w-full text-base"
          onClick={() => submit(false)}
          disabled={busy}
        >
          Save changes
        </Button>
      )}
    </div>
  );
}
