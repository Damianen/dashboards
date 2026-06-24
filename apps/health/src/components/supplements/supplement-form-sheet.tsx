"use client";

import { useId, useState } from "react";
import { Drawer } from "vaul";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateSupplement,
  useUpdateSupplement,
  type SupplementDTO,
} from "@/lib/hooks/use-supplements";
import {
  createSupplementSchema,
  SUPPLEMENT_UNITS,
  type SupplementTimeGroup,
} from "@/lib/schemas/supplement";

/** Bottom-sheet form to add a new supplement or edit an existing one. */
export function SupplementFormSheet({
  open,
  onOpenChange,
  supplement,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplement?: SupplementDTO;
}) {
  const editing = supplement != null;

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Drawer.Content
          className="bg-card fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[90dvh] flex-col rounded-t-2xl border-t outline-none"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full" />
          <div className="mx-auto w-full max-w-md space-y-4 p-4">
            <Drawer.Title className="text-base font-semibold">
              {editing ? "Edit supplement" : "Add supplement"}
            </Drawer.Title>
            <Drawer.Description className="sr-only">
              Set the name, dose, unit, and time of day.
            </Drawer.Description>

            {/* Keyed so the fields remount (and re-seed from the target) each open. */}
            {open && (
              <SupplementFields
                key={supplement?.id ?? "new"}
                supplement={supplement}
                onDone={() => onOpenChange(false)}
              />
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function SupplementFields({
  supplement,
  onDone,
}: {
  supplement?: SupplementDTO;
  onDone: () => void;
}) {
  const baseId = useId();
  const editing = supplement != null;

  const [name, setName] = useState(supplement?.name ?? "");
  const [dose, setDose] = useState(supplement ? String(supplement.dose) : "");
  const [unit, setUnit] = useState<string>(supplement?.unit ?? "mg");
  const [timeGroup, setTimeGroup] = useState<SupplementTimeGroup>(
    supplement?.timeGroup ?? "MORNING",
  );

  const create = useCreateSupplement();
  const update = useUpdateSupplement(supplement?.id ?? "");
  const pending = create.isPending || update.isPending;

  function submit() {
    const parsed = createSupplementSchema.safeParse({
      name,
      dose: Number(dose),
      unit,
      timeGroup,
    });
    if (!parsed.success) {
      toast.error("Enter a name, dose, and unit");
      return;
    }
    if (editing) update.mutate(parsed.data, { onSuccess: onDone });
    else create.mutate(parsed.data, { onSuccess: onDone });
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
        <Label htmlFor={`${baseId}-name`}>Name</Label>
        <Input
          id={`${baseId}-name`}
          placeholder="e.g. Creatine"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${baseId}-dose`}>Dose</Label>
          <Input
            id={`${baseId}-dose`}
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
          <Label htmlFor={`${baseId}-unit`}>Unit</Label>
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger id={`${baseId}-unit`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPLEMENT_UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Time of day</Label>
        <Segmented
          ariaLabel="Time of day"
          value={timeGroup}
          onChange={setTimeGroup}
          options={[
            { value: "MORNING", label: "Morning" },
            { value: "EVENING", label: "Evening" },
            { value: "PRE_WORKOUT", label: "Pre-workout" },
          ]}
        />
      </div>

      <Button
        type="submit"
        className="h-12 w-full"
        disabled={pending || name === "" || dose === ""}
      >
        {editing ? "Save changes" : "Add supplement"}
      </Button>
    </form>
  );
}
