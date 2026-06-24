"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Flame } from "lucide-react";
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
import { intakeTargetSchema } from "@/lib/schemas/settings";

// Daily intake calorie target. An intake-ONLY goal shown against logged calories — never
// a deficit or an expenditure figure (CLAUDE.md no-net-calories guardrail). Saving
// invalidates adherence so Today's intake progress refreshes. Empty until set.
export function CalorieTargetCard() {
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getJSON<{ kcal: number | null }>("/api/settings/intake-target")
      .then((d) => setValue(d.kcal == null ? "" : String(d.kcal)))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function handleSave() {
    const parsed = intakeTargetSchema.safeParse({ kcal: value });
    if (!parsed.success) {
      toast.error("Enter a calorie target between 500 and 10000 kcal");
      return;
    }
    setSaving(true);
    try {
      const d = await patchJSON<{ kcal: number }>(
        "/api/settings/intake-target",
        { kcal: parsed.data.kcal },
      );
      setValue(String(d.kcal));
      await qc.invalidateQueries({ queryKey: ["adherence"] });
      toast.success("Calorie target updated");
    } catch {
      toast.error("Couldn't update calorie target");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="size-4" /> Calorie target
        </CardTitle>
        <CardDescription>
          A daily intake goal, shown against the calories you log. It is never a
          deficit or expenditure target.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="intake-kcal-target">kcal</Label>
            <Input
              id="intake-kcal-target"
              type="number"
              inputMode="numeric"
              min={500}
              max={10000}
              step={10}
              placeholder="e.g. 2200"
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
