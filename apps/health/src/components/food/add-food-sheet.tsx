"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { EstimatePhotoTab } from "@/components/food/estimate-photo-tab";
import { FoodDialog } from "@/components/food/food-dialog";
import { MealsAddTab } from "@/components/food/meals/meals-add-tab";
import { MyFoodsTab } from "@/components/food/my-foods-tab";
import { QuantityStep } from "@/components/food/quantity-step";
import { RecentFoodChips } from "@/components/food/recent-foods";
import { ScanLabelTab } from "@/components/food/scan-label-tab";
import { ScanTab } from "@/components/food/scan-tab";
import { SearchTab } from "@/components/food/search-tab";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { getJSON, HttpError } from "@/lib/fetcher";
import {
  type FoodProductDTO,
  type LoggableItem,
  productToLoggable,
} from "@/lib/food";
import { usePersistentState } from "@/lib/hooks/use-persistent-state";

const TAB_VALUES = [
  "scan",
  "scanLabel",
  "estimate",
  "search",
  "myFoods",
  "meals",
] as const;
type Tab = (typeof TAB_VALUES)[number];

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
 * the My foods tab's quick one-off. My foods also browses/logs saved custom
 * foods and creates new ones. The tab is remembered across opens (2-tap
 * re-logging); everything else resets on close.
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
  const [storedTab, setStoredTab] = usePersistentState<Tab>(
    "health:addFoodTab",
    "scan",
    TAB_VALUES,
  );
  // Programmatic jumps (barcode-not-found, vision fallbacks) are session-only:
  // they must not overwrite the remembered tab the user actually chose.
  const [tabOverride, setTabOverride] = useState<Tab | null>(null);
  const tab = tabOverride ?? storedTab;
  function setTab(next: Tab) {
    setTabOverride(null);
    setStoredTab(next);
  }
  const [loggable, setLoggable] = useState<{
    item: LoggableItem;
    initialGrams?: number;
  } | null>(null);
  const [looking, setLooking] = useState(false);
  const [oneOffJump, setOneOffJump] = useState(false);

  function reset() {
    setTabOverride(null);
    setLoggable(null);
    setLooking(false);
    setOneOffJump(false);
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
      setLoggable({ item: productToLoggable(found) });
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        setOneOffJump(true);
        setTabOverride("myFoods");
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
    <FoodDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Add food"
      description="Scan a barcode, search Open Food Facts, or add a custom food."
      // A picked or in-lookup food is work worth guarding even before the
      // quantity step is touched; the tabs report their own fields.
      dirty={loggable != null || looking}
      bodyClassName="space-y-4"
    >
      {showTabs && (
        <>
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={TABS}
            columns={3}
            ariaLabel="Add food method"
          />
          {/* On every landing tab so a recent re-log is always 2 taps. */}
          <RecentFoodChips
            day={day}
            onLogged={() => handleOpenChange(false)}
          />
        </>
      )}

      {loggable ? (
        <QuantityStep
          item={loggable.item}
          day={day}
          initialGrams={loggable.initialGrams}
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
          onLog={(item) => setLoggable({ item })}
          onSaved={() => handleOpenChange(false)}
          onFallback={() => setTabOverride("myFoods")}
        />
      ) : tab === "estimate" ? (
        <EstimatePhotoTab
          day={day}
          onLogged={() => handleOpenChange(false)}
          onFallback={() => setTabOverride("myFoods")}
        />
      ) : tab === "search" ? (
        <SearchTab
          day={day}
          onBarcode={handleBarcode}
          onPickRecent={(item, initialGrams) =>
            setLoggable({ item, initialGrams })
          }
          onLogged={() => handleOpenChange(false)}
        />
      ) : tab === "myFoods" ? (
        <MyFoodsTab
          day={day}
          jumpToOneOff={oneOffJump}
          onLog={(item) => setLoggable({ item })}
          onLogged={() => handleOpenChange(false)}
        />
      ) : (
        <MealsAddTab day={day} onLogged={() => handleOpenChange(false)} />
      )}
    </FoodDialog>
  );
}
