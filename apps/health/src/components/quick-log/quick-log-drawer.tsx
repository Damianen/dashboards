"use client";

import { useState } from "react";
import { Drawer } from "vaul";

import { StimulantForm } from "@/components/quick-log/stimulant-form";
import { SupplementForm } from "@/components/quick-log/supplement-form";
import { WaterForm } from "@/components/quick-log/water-form";
import { todayLocal } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Segment = "water" | "stimulant" | "supplement";

const SEGMENTS: { id: Segment; label: string }[] = [
  { id: "water", label: "Water" },
  { id: "stimulant", label: "Stimulant" },
  { id: "supplement", label: "Supplement" },
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
              Quick log
            </Drawer.Title>
            <Drawer.Description className="sr-only">
              Log water, a stimulant, or a supplement.
            </Drawer.Description>

            <div className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1">
              {SEGMENTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSegment(s.id)}
                  className={cn(
                    "rounded-md py-2 text-sm font-medium transition-colors",
                    segment === s.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {segment === "water" && <WaterForm day={day} onLogged={close} />}
            {segment === "stimulant" && (
              <StimulantForm day={day} onLogged={close} />
            )}
            {segment === "supplement" && (
              <SupplementForm day={day} onLogged={close} />
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
