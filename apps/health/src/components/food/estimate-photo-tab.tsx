"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { MealPicker } from "@/components/food/meal-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postJSON } from "@/lib/fetcher";
import { suggestMeal } from "@/lib/food";
import { formatNumber } from "@/lib/format";
import { fileToDownscaledDataUrl } from "@/lib/image";
import { useLogFood } from "@/lib/hooks/use-log-food";
import type { LogFoodInput } from "@/lib/schemas/food";
import type { MealEstimate } from "@/lib/schemas/vision";

type Confidence = MealEstimate["confidence"];
type Component = MealEstimate["components"][number];

const CONFIDENCE: Record<
  Confidence,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  high: { label: "High confidence", variant: "default" },
  medium: { label: "Medium confidence", variant: "secondary" },
  low: { label: "Low confidence", variant: "destructive" },
};

/** Round to 1 dp — mirrors the server idiom so the saved per-100 g lines up. */
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * Estimate a meal/plate photo into an editable AI-estimate draft — the restaurant /
 * no-label fallback to the barcode and label-scan tabs. The endpoint returns a DRAFT
 * only (it never writes); these are ROUGH estimates the user confirms and edits before
 * logging. "Log estimate" writes a one-off custom entry (a restaurant plate isn't itself
 * reusable) carrying the "(AI estimate)" suffix into the diary; an opt-in also saves it
 * as a reusable custom food. A vision failure drops to the manual Custom tab.
 */
export function EstimatePhotoTab({
  day,
  onLogged,
  onFallback,
}: {
  day: string;
  onLogged: () => void;
  onFallback: () => void;
}) {
  const [phase, setPhase] = useState<"capture" | "scanning" | "review">(
    "capture",
  );
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [description, setDescription] = useState("");
  const [components, setComponents] = useState<Component[]>([]);
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carb, setCarb] = useState("");
  const [fat, setFat] = useState("");
  const [confidence, setConfidence] = useState<Confidence>("low");
  const [assumptions, setAssumptions] = useState("");
  const [caveat, setCaveat] = useState("");
  const [meal, setMeal] = useState(() => suggestMeal(new Date()));
  const [alsoSave, setAlsoSave] = useState(false);
  const [busy, setBusy] = useState(false);

  const { mutateAsync } = useLogFood(day);

  // The estimated plate weight: hidden in the diary for custom entries, but a
  // required (gt 0) quantity, and the basis for an opt-in reusable per-100 g food.
  const totalGrams = components.reduce((t, c) => t + c.estGrams, 0);

  function fill(est: MealEstimate) {
    setDescription(est.description);
    setComponents(est.components);
    setKcal(String(est.totalKcal));
    setProtein(String(est.totalProteinG));
    setCarb(String(est.totalCarbG));
    setFat(String(est.totalFatG));
    setConfidence(est.confidence);
    setAssumptions(est.assumptions);
    setCaveat(est.caveat);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setPhase("scanning");
    try {
      const imageDataUrl = await fileToDownscaledDataUrl(file);
      const est = await postJSON<MealEstimate>("/api/food/estimate-meal", {
        imageDataUrl,
      });
      fill(est);
      setPhase("review");
    } catch {
      toast.error("Couldn't estimate that photo — enter it manually");
      onFallback();
    }
  }

  /** The four edited totals, validated; null (with a toast) when anything's off. */
  function readTotals(): {
    kcal: number;
    proteinG: number;
    carbG: number;
    fatG: number;
  } | null {
    if (description.trim() === "") {
      toast.error("Add a short description");
      return null;
    }
    const fields = [kcal, protein, carb, fat];
    if (
      fields.some(
        (v) => v.trim() === "" || !Number.isFinite(Number(v)) || Number(v) < 0,
      )
    ) {
      toast.error("Calories and macros must be valid numbers");
      return null;
    }
    return {
      kcal: Number(kcal),
      proteinG: Number(protein),
      carbG: Number(carb),
      fatG: Number(fat),
    };
  }

  async function logEstimate() {
    const totals = readTotals();
    if (!totals) return;
    setBusy(true);
    try {
      // Opt-in: also persist a reusable custom food, deriving per-100 g from the
      // edited totals over the estimated plate weight. Best-effort — a failure
      // here never blocks logging the entry.
      if (alsoSave && totalGrams > 0) {
        const factor = 100 / totalGrams;
        try {
          await postJSON("/api/food/custom", {
            name: description.trim(),
            per100g: {
              kcal: round1(totals.kcal * factor),
              proteinG: round1(totals.proteinG * factor),
              carbG: round1(totals.carbG * factor),
              fatG: round1(totals.fatG * factor),
            },
            servingG: round1(totalGrams),
            source: "MANUAL",
          });
        } catch {
          toast.error("Couldn't also save as a custom food — logging the entry only");
        }
      }

      const customName = `${description.trim()} (AI estimate)`;
      const quantityG = Math.min(5000, Math.max(1, Math.round(totalGrams)));
      const input: LogFoodInput = {
        customName,
        quantityG,
        meal,
        kcal: totals.kcal,
        proteinG: totals.proteinG,
        carbG: totals.carbG,
        fatG: totals.fatG,
        ...(assumptions.trim() !== "" ? { notes: assumptions.trim() } : {}),
      };
      await mutateAsync({
        input,
        preview: {
          displayName: customName,
          imageUrl: null,
          quantityG,
          meal,
          macros: totals,
        },
      });
      onLogged();
    } catch {
      // useLogFood already toasted "Couldn't log food" on the mutation error.
    } finally {
      setBusy(false);
    }
  }

  if (phase === "scanning") {
    return (
      <div className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Estimating the meal…
      </div>
    );
  }

  if (phase === "capture") {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">
          No label? Snap your plate — a restaurant meal or home cooking — and AI
          estimates the calories and macros. It&apos;s a rough estimate you
          review and edit before it&apos;s logged.
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
        {confidence === "low" && (
          <p className="text-destructive text-xs font-medium">
            Low confidence — these are rough guesses; check the numbers before
            saving.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="estimate-desc">Description</Label>
        <Input
          id="estimate-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Chicken curry with rice"
        />
      </div>

      {components.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-[10px] uppercase">
            What the photo shows
          </div>
          <ul className="bg-muted space-y-1 rounded-lg p-3 text-sm">
            {components.map((c, i) => (
              <li
                key={`${c.name}-${i}`}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  ~{formatNumber(c.estGrams)} g · {formatNumber(c.kcal)} kcal
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="estimate-kcal">Total calories (kcal)</Label>
        <Input
          id="estimate-kcal"
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
          <Label htmlFor="estimate-protein">Protein (g)</Label>
          <Input
            id="estimate-protein"
            type="number"
            inputMode="decimal"
            min={0}
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="estimate-carb">Carbs (g)</Label>
          <Input
            id="estimate-carb"
            type="number"
            inputMode="decimal"
            min={0}
            value={carb}
            onChange={(e) => setCarb(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="estimate-fat">Fat (g)</Label>
          <Input
            id="estimate-fat"
            type="number"
            inputMode="decimal"
            min={0}
            value={fat}
            onChange={(e) => setFat(e.target.value)}
          />
        </div>
      </div>

      {assumptions.trim() !== "" && (
        <p className="text-muted-foreground text-xs">
          <span className="font-medium">Assumptions:</span> {assumptions}
        </p>
      )}
      {caveat.trim() !== "" && (
        <p className="text-muted-foreground text-xs italic">{caveat}</p>
      )}

      <div className="space-y-1.5">
        <Label>Meal</Label>
        <MealPicker value={meal} onChange={setMeal} />
      </div>

      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={alsoSave}
          disabled={totalGrams <= 0}
          onChange={(e) => setAlsoSave(e.target.checked)}
          className="size-4 accent-primary"
        />
        <span className={totalGrams <= 0 ? "text-muted-foreground" : ""}>
          Also save as a reusable custom food
        </span>
      </label>

      <Button
        type="button"
        className="h-12 w-full text-base"
        onClick={() => void logEstimate()}
        disabled={busy}
      >
        Log estimate
      </Button>
    </div>
  );
}
