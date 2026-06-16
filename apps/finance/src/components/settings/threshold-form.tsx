"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateLargeTxnThreshold } from "@/server/actions/settings";

// Edits the large-transaction alert threshold. Validation matches the server
// schema; the action persists and revalidates.
export function ThresholdForm({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const valid = /^\d+(\.\d{1,2})?$/.test(value.trim()) && Number(value) > 0;
  const dirty = value.trim() !== initial;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">€</span>
        <Input
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          className="h-9 max-w-32"
        />
        <Button
          size="sm"
          disabled={!valid || !dirty || pending}
          onClick={() =>
            startTransition(async () => {
              await updateLargeTxnThreshold({ largeTxnThreshold: value.trim() });
              setSaved(true);
              router.refresh();
            })
          }
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {saved && (
        <span className="text-xs text-muted-foreground">Threshold updated.</span>
      )}
    </div>
  );
}
