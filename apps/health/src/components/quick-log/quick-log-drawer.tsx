"use client";

import { useState } from "react";

import { StimulantForm } from "@/components/quick-log/stimulant-form";
import { WaterForm } from "@/components/quick-log/water-form";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { todayLocal } from "@/lib/dates";

type Segment = "water" | "stimulant";

const SEGMENTS: SegmentedOption<Segment>[] = [
  { value: "water", label: "Water" },
  { value: "stimulant", label: "Stimulant" },
];

export function QuickLogDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [segment, setSegment] = useState<Segment>("water");
  const day = todayLocal();

  const close = () => onOpenChange(false);

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Quick log"
      description="Log water or a stimulant."
      showTitle
      titleClassName="text-base font-semibold"
      bodyClassName="space-y-4"
    >
      <Segmented<Segment>
        value={segment}
        onChange={setSegment}
        options={SEGMENTS}
        ariaLabel="What to log"
      />

      {segment === "water" && <WaterForm day={day} onLogged={close} />}
      {segment === "stimulant" && <StimulantForm day={day} onLogged={close} />}
    </BottomSheet>
  );
}
