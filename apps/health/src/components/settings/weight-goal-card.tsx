"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Target } from "lucide-react";
import { useEffect, useState } from "react";
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
import { getJSON, patchJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import { weightGoalSchema } from "@/lib/schemas/settings";

// Goal body weight. Saving re-derives the projection on the Trends weight card, so we
// invalidate the weight-goal query on save. Empty until the user sets one.
export function WeightGoalCard() {
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getJSON<{ goalKg: number | null }>("/api/settings/weight-goal")
      .then((d) => setValue(d.goalKg == null ? "" : String(d.goalKg)))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function handleSave() {
    const parsed = weightGoalSchema.safeParse({ goalKg: value });
    if (!parsed.success) {
      toast.error("Enter a goal weight between 20 and 500 kg");
      return;
    }
    setSaving(true);
    try {
      const d = await patchJSON<{ goalKg: number }>(
        "/api/settings/weight-goal",
        { goalKg: parsed.data.goalKg },
      );
      setValue(String(d.goalKg));
      await qc.invalidateQueries({ queryKey: queryKeys.weightGoal() });
      toast.success("Weight goal updated");
    } catch {
      toast.error("Couldn't update weight goal");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="size-4" /> Weight goal
        </CardTitle>
        <CardDescription>
          Your target body weight. The Trends weight chart projects an ETA from
          your measured trend.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="weight-goal-kg">kg</Label>
            <Input
              id="weight-goal-kg"
              type="number"
              inputMode="decimal"
              min={20}
              max={500}
              step={0.1}
              placeholder="e.g. 75"
              className="w-28"
              value={value}
              disabled={!loaded || saving}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <Button onClick={() => void handleSave()} disabled={!loaded || saving}>
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
