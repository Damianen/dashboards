"use client";

import { useState } from "react";
import { toast } from "sonner";

import { getJSON, HttpError } from "@/lib/fetcher";
import type { FoodProductDTO } from "@/lib/food";

/**
 * Shared scan/search → product lookup for the food sheets: `lookup` fires
 * GET /api/food/products/{barcode} and flips `looking` around it (only inside
 * the promise callbacks). A 404 means OFF doesn't know the barcode — the
 * caller supplies its own guidance/side effects via `onNotFound`; any other
 * failure toasts the shared copy here.
 */
export function useBarcodeLookup(opts: {
  onFound: (product: FoodProductDTO) => void;
  onNotFound: () => void;
}): { looking: boolean; lookup: (barcode: string) => void } {
  const [looking, setLooking] = useState(false);

  function lookup(barcode: string) {
    setLooking(true);
    getJSON<FoodProductDTO>(`/api/food/products/${encodeURIComponent(barcode)}`)
      .then((product) => opts.onFound(product))
      .catch((err: unknown) => {
        if (err instanceof HttpError && err.status === 404) {
          opts.onNotFound();
        } else {
          toast.error("Couldn't look up that barcode");
        }
      })
      .finally(() => setLooking(false));
  }

  return { looking, lookup };
}
