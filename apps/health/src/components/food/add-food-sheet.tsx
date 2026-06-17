"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Drawer } from "vaul";

import { CustomTab } from "@/components/food/custom-tab";
import { QuantityStep } from "@/components/food/quantity-step";
import { ScanLabelTab } from "@/components/food/scan-label-tab";
import { ScanTab } from "@/components/food/scan-tab";
import { SearchTab } from "@/components/food/search-tab";
import { getJSON, HttpError } from "@/lib/fetcher";
import {
  type FoodProductDTO,
  type LoggableItem,
  productToLoggable,
} from "@/lib/food";
import { cn } from "@/lib/utils";

type Tab = "scan" | "scanLabel" | "search" | "custom";

const TABS: { id: Tab; label: string }[] = [
  { id: "scan", label: "Scan" },
  { id: "scanLabel", label: "Scan label" },
  { id: "search", label: "Search" },
  { id: "custom", label: "Custom" },
];

/**
 * "Add food" bottom sheet. Scan/Search produce a barcode → the sheet looks the
 * product up and converges on the quantity step; a not-found barcode drops into
 * the Custom tab prefilled. Custom logs directly. State resets on close.
 */
export function AddFoodSheet({
  open,
  onOpenChange,
  day,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  day: string;
}) {
  const [tab, setTab] = useState<Tab>("scan");
  const [loggable, setLoggable] = useState<LoggableItem | null>(null);
  const [looking, setLooking] = useState(false);
  const [prefillName, setPrefillName] = useState<string | null>(null);

  function reset() {
    setTab("scan");
    setLoggable(null);
    setLooking(false);
    setPrefillName(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleBarcode(barcode: string) {
    setLooking(true);
    try {
      const found = await getJSON<FoodProductDTO>(
        `/api/food/products/${encodeURIComponent(barcode)}`,
      );
      setLoggable(productToLoggable(found));
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        setPrefillName(barcode);
        setTab("custom");
        toast.error("Product not found — add it as a custom entry");
      } else {
        toast.error("Couldn't look up that barcode");
      }
    } finally {
      setLooking(false);
    }
  }

  const showTabs = !loggable && !looking;

  return (
    <Drawer.Root open={open} onOpenChange={handleOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Drawer.Content
          className="bg-card fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[90dvh] flex-col rounded-t-2xl border-t outline-none"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full" />
          <div className="mx-auto w-full max-w-md space-y-4 overflow-y-auto p-4">
            <Drawer.Title className="sr-only">Add food</Drawer.Title>
            <Drawer.Description className="sr-only">
              Scan a barcode, search Open Food Facts, or add a custom food.
            </Drawer.Description>

            {showTabs && (
              <div className="bg-muted grid grid-cols-4 gap-1 rounded-lg p-1">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "rounded-md py-2 text-sm font-medium transition-colors",
                      tab === t.id
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            {loggable ? (
              <QuantityStep
                item={loggable}
                day={day}
                onBack={() => setLoggable(null)}
                onLogged={() => handleOpenChange(false)}
              />
            ) : looking ? (
              <div className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Looking up product…
              </div>
            ) : tab === "scan" ? (
              <ScanTab active={open && tab === "scan"} onBarcode={handleBarcode} />
            ) : tab === "scanLabel" ? (
              <ScanLabelTab
                onLog={setLoggable}
                onSaved={() => handleOpenChange(false)}
                onFallback={() => setTab("custom")}
              />
            ) : tab === "search" ? (
              <SearchTab onBarcode={handleBarcode} />
            ) : (
              <CustomTab
                day={day}
                prefillName={prefillName}
                onLogged={() => handleOpenChange(false)}
              />
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
