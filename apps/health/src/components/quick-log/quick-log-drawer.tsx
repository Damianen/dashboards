"use client";

import { StimulantForm } from "@/components/quick-log/stimulant-form";
import { WaterForm } from "@/components/quick-log/water-form";
import { WeightForm } from "@/components/quick-log/weight-form";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { todayLocal } from "@/lib/dates";
import { usePersistentState } from "@/lib/hooks/use-persistent-state";

const SEGMENT_VALUES = ["water", "stimulant", "weight"] as const;
type Segment = (typeof SEGMENT_VALUES)[number];

const SEGMENTS: SegmentedOption<Segment>[] = [
  { value: "water", label: "Water" },
  { value: "stimulant", label: "Stimulant" },
  { value: "weight", label: "Weight" },
];

export function QuickLogDrawer({
  open,
  onOpenChange,
  initialSegment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** PWA-shortcut override (?quick=); wins over the remembered segment. */
  initialSegment?: Segment;
}) {
  // Remembers the last-SELECTED segment so repeating it is FAB → preset
  // (2 taps). Only segment taps persist; logging and shortcut launches don't.
  const [segment, setSegment] = usePersistentState<Segment>(
    "health:quickLogSegment",
    "water",
    SEGMENT_VALUES,
    initialSegment,
  );
  const day = todayLocal();

  const close = () => onOpenChange(false);

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Quick log"
      description="Log water, a stimulant, or your weight."
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
      {segment === "weight" && <WeightForm day={day} onLogged={close} />}
    </BottomSheet>
  );
}
