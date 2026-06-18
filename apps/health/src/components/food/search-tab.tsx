"use client";

import { useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useFoodSearch } from "@/lib/hooks/use-food-search";

/** Debounced OFF product search; picking a result hands its barcode up to the sheet. */
export function SearchTab({ onBarcode }: { onBarcode: (barcode: string) => void }) {
  const [query, setQuery] = useState("");
  const { data, isFetching, isError } = useFoodSearch(query);
  const results = data ?? [];

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search foods"
          aria-label="Search foods"
          className="h-11 pl-9"
        />
      </div>

      <div className="max-h-[55dvh] space-y-1 overflow-y-auto">
        {isFetching ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))
        ) : isError ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Search is unavailable right now.
          </p>
        ) : query.trim().length < 2 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Type to search Open Food Facts.
          </p>
        ) : results.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No products found.
          </p>
        ) : (
          results.map((r) => (
            <button
              key={r.barcode}
              type="button"
              onClick={() => onBarcode(r.barcode)}
              className="hover:bg-accent flex min-h-14 w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors"
            >
              <div className="bg-muted size-10 shrink-0 overflow-hidden rounded">
                {r.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- OFF CDN thumbnails, no Image config
                  <img
                    src={r.imageUrl}
                    alt=""
                    className="size-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {r.name || r.barcode}
                </div>
                {r.brand && (
                  <div className="text-muted-foreground truncate text-xs">
                    {r.brand}
                  </div>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
