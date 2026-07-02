"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { EstimatePhotoTab } from "@/components/food/estimate-photo-tab";
import { MealsAddTab } from "@/components/food/meals/meals-add-tab";
import { MyFoodsTab } from "@/components/food/my-foods-tab";
import { QuantityStep } from "@/components/food/quantity-step";
import { ScanLabelTab } from "@/components/food/scan-label-tab";
import { ScanTab } from "@/components/food/scan-tab";
import { SearchTab } from "@/components/food/search-tab";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { getJSON, HttpError } from "@/lib/fetcher";
import {
  type FoodProductDTO,
  type LoggableItem,
  productToLoggable,
} from "@/lib/food";

type Tab = "scan" | "scanLabel" | "estimate" | "search" | "myFoods" | "meals";

const TABS: SegmentedOption<Tab>[] = [
  { value: "scan", label: "Scan" },
  { value: "scanLabel", label: "Scan label" },
  { value: "estimate", label: "Estimate" },
  { value: "search", label: "Search" },
  { value: "myFoods", label: "My foods" },
  { value: "meals", label: "Meals" },
];

/**
 * "Add food" bottom sheet. Scan/Search produce a barcode → the sheet looks the
 * product up and converges on the quantity step; a not-found barcode drops into
 * the My foods tab's quick one-off, prefilled. My foods also browses/logs saved
 * custom foods and creates new ones. State resets on close.
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
        setTab("myFoods");
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
    <BottomSheet
      open={open}
      onOpenChange={handleOpenChange}
      title="Add food"
      description="Scan a barcode, search Open Food Facts, or add a custom food."
      bodyClassName="space-y-4 overflow-y-auto"
    >
      {showTabs && (
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={TABS}
          columns={3}
          ariaLabel="Add food method"
        />
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
          onFallback={() => setTab("myFoods")}
        />
      ) : tab === "estimate" ? (
        <EstimatePhotoTab
          day={day}
          onLogged={() => handleOpenChange(false)}
          onFallback={() => setTab("myFoods")}
        />
      ) : tab === "search" ? (
        <SearchTab onBarcode={handleBarcode} />
      ) : tab === "myFoods" ? (
        <MyFoodsTab
          day={day}
          prefillName={prefillName}
          onLog={setLoggable}
          onLogged={() => handleOpenChange(false)}
        />
      ) : (
        <MealsAddTab day={day} onLogged={() => handleOpenChange(false)} />
      )}
    </BottomSheet>
  );
}
