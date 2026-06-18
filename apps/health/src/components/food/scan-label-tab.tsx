"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LoggableItem } from "@/lib/food";
import { postJSON } from "@/lib/fetcher";
import { fileToDownscaledDataUrl } from "@/lib/image";
import {
  type CreateCustomFoodInput,
  createCustomFoodSchema,
  type Per100g,
} from "@/lib/schemas/food";

type Confidence = "high" | "medium" | "low";

/** The wire shape of POST /api/food/scan-label (mirrors LabelScanResponse). */
interface ScanResponse {
  draft: {
    name: string;
    brand?: string;
    servingG?: number;
    per100g: Per100g | null;
    source: "LABEL_SCAN";
  };
  confidence: Confidence;
  notes: string;
}

const CONFIDENCE: Record<
  Confidence,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  high: { label: "High confidence", variant: "default" },
  medium: { label: "Medium confidence", variant: "secondary" },
  low: { label: "Low confidence", variant: "destructive" },
};

/**
 * Scan a nutrition label into an editable custom-food draft. The scan endpoint
 * returns a DRAFT only — it never writes; saving is a separate explicit call. AI
 * vision is an estimate the user confirms (and edits) before save. A vision failure
 * drops to the manual Custom tab. "Save food" creates the food; "Save & log" hands
 * the new food to the quantity step.
 */
export function ScanLabelTab({
  onLog,
  onSaved,
  onFallback,
}: {
  onLog: (item: LoggableItem) => void;
  onSaved: () => void;
  onFallback: () => void;
}) {
  const [phase, setPhase] = useState<"capture" | "scanning" | "review">(
    "capture",
  );
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [serving, setServing] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carb, setCarb] = useState("");
  const [fat, setFat] = useState("");
  const [fiber, setFiber] = useState("");
  const [sugar, setSugar] = useState("");
  const [salt, setSalt] = useState("");
  const [confidence, setConfidence] = useState<Confidence>("medium");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  function fill(res: ScanResponse) {
    const d = res.draft;
    const p = d.per100g;
    setName(d.name);
    setBrand(d.brand ?? "");
    setServing(d.servingG != null ? String(d.servingG) : "");
    setKcal(p ? String(p.kcal) : "");
    setProtein(p ? String(p.proteinG) : "");
    setCarb(p ? String(p.carbG) : "");
    setFat(p ? String(p.fatG) : "");
    setFiber(p?.fiberG != null ? String(p.fiberG) : "");
    setSugar(p?.sugarG != null ? String(p.sugarG) : "");
    setSalt(p?.saltG != null ? String(p.saltG) : "");
    setConfidence(res.confidence);
    setNotes(res.notes);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setPhase("scanning");
    try {
      const imageDataUrl = await fileToDownscaledDataUrl(file);
      const res = await postJSON<ScanResponse>("/api/food/scan-label", {
        imageDataUrl,
      });
      fill(res);
      setPhase("review");
    } catch {
      toast.error("Couldn't read that label — enter it manually");
      onFallback();
    }
  }

  function buildInput(): CreateCustomFoodInput | null {
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
      },
      ...(serving.trim() !== "" ? { servingG: Number(serving) } : {}),
      source: "LABEL_SCAN" as const,
    };
    const parsed = createCustomFoodSchema.safeParse(candidate);
    if (!parsed.success) {
      toast.error("Those numbers don't look right — please check them");
      return null;
    }
    return parsed.data;
  }

  function toLoggable(input: CreateCustomFoodInput, id: string): LoggableItem {
    const p = input.per100g;
    return {
      name: input.name,
      brand: input.brand ?? null,
      imageUrl: null,
      per100g: {
        kcal: p.kcal,
        proteinG: p.proteinG,
        carbG: p.carbG,
        fatG: p.fatG,
        fiberG: p.fiberG ?? null,
        sugarG: p.sugarG ?? null,
        saltG: p.saltG ?? null,
      },
      servingG: input.servingG ?? null,
      ref: { kind: "customFood", customFoodId: id },
    };
  }

  async function save(thenLog: boolean) {
    const input = buildInput();
    if (!input) return;
    setSaving(true);
    try {
      const created = await postJSON<{ id: string }>("/api/food/custom", input);
      if (thenLog) {
        onLog(toLoggable(input, created.id));
      } else {
        toast.success("Food saved");
        onSaved();
      }
    } catch {
      toast.error("Couldn't save the food");
    } finally {
      setSaving(false);
    }
  }

  if (phase === "scanning") {
    return (
      <div className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Reading the label…
      </div>
    );
  }

  if (phase === "capture") {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Snap a nutrition label and the values are read into an editable draft.
          AI vision is an estimate — you confirm before it&apos;s saved.
        </p>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <Button
          type="button"
          className="h-12 w-full text-base"
          onClick={() => cameraRef.current?.click()}
        >
          <Camera className="size-5" aria-hidden />
          Take a photo
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-12 w-full text-base"
          onClick={() => galleryRef.current?.click()}
        >
          <ImagePlus className="size-5" aria-hidden />
          Choose from gallery
        </Button>
      </div>
    );
  }

  const conf = CONFIDENCE[confidence];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline">AI estimate</Badge>
            <Badge variant={conf.variant}>{conf.label}</Badge>
          </div>
          <button
            type="button"
            onClick={() => setPhase("capture")}
            className="text-muted-foreground text-sm font-medium underline-offset-2 hover:underline"
          >
            Retake
          </button>
        </div>
        {notes && <p className="text-muted-foreground text-xs">{notes}</p>}
        {confidence === "low" && (
          <p className="text-destructive text-xs font-medium">
            Low confidence — double-check these numbers before saving.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="label-name">Name</Label>
        <Input
          id="label-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Product name"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="label-brand">Brand</Label>
          <Input
            id="label-brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="opt."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="label-serving">Serving (g)</Label>
          <Input
            id="label-serving"
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
        <Label htmlFor="label-kcal">Calories per 100 g (kcal)</Label>
        <Input
          id="label-kcal"
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
          <Label htmlFor="label-protein">Protein (g)</Label>
          <Input
            id="label-protein"
            type="number"
            inputMode="decimal"
            min={0}
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="label-carb">Carbs (g)</Label>
          <Input
            id="label-carb"
            type="number"
            inputMode="decimal"
            min={0}
            value={carb}
            onChange={(e) => setCarb(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="label-fat">Fat (g)</Label>
          <Input
            id="label-fat"
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
          <Label htmlFor="label-fiber">Fiber (g)</Label>
          <Input
            id="label-fiber"
            type="number"
            inputMode="decimal"
            min={0}
            value={fiber}
            onChange={(e) => setFiber(e.target.value)}
            placeholder="opt."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="label-sugar">Sugar (g)</Label>
          <Input
            id="label-sugar"
            type="number"
            inputMode="decimal"
            min={0}
            value={sugar}
            onChange={(e) => setSugar(e.target.value)}
            placeholder="opt."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="label-salt">Salt (g)</Label>
          <Input
            id="label-salt"
            type="number"
            inputMode="decimal"
            min={0}
            value={salt}
            onChange={(e) => setSalt(e.target.value)}
            placeholder="opt."
          />
        </div>
      </div>

      <div className="text-muted-foreground text-[10px] uppercase">
        Macros are per 100 g — the next step scales them to your portion.
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="secondary"
          className="h-12 text-base"
          onClick={() => void save(false)}
          disabled={saving}
        >
          Save food
        </Button>
        <Button
          type="button"
          className="h-12 text-base"
          onClick={() => void save(true)}
          disabled={saving}
        >
          Save &amp; log
        </Button>
      </div>
    </div>
  );
}
