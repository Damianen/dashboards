import { Suspense } from "react";

import { FoodPage } from "@/components/food/food-page";
import { Skeleton } from "@/components/ui/skeleton";

/** Static shell for the Suspense fallback so the prerendered /food page (and
 *  the /food?quick=add PWA shortcut's cold launch) isn't blank pre-hydration. */
function FoodPageShell() {
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Food</h1>
      </header>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}

export default function Page() {
  // Suspense: FoodPage reads useSearchParams (PWA shortcut deep link).
  return (
    <Suspense fallback={<FoodPageShell />}>
      <FoodPage />
    </Suspense>
  );
}
