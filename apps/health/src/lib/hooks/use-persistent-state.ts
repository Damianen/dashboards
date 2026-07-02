"use client";

import { useCallback, useState } from "react";

/**
 * useState persisted to localStorage. Hydration-safe by construction: the value
 * is read in a lazy initializer (never a setState-in-effect), the server render
 * returns `fallback`, and consumers only render value-dependent DOM inside
 * vaul portals that mount after a client-side tap — so server/client divergence
 * never reaches hydrated markup. `override` (e.g. a PWA-shortcut ?quick= param)
 * wins over the stored value and is deterministic on server and client.
 * Reads/writes are try/catch'd (private mode → session-only state).
 */
export function usePersistentState<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
  override?: T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (override !== undefined) return override;
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(key);
      return raw !== null && (allowed as readonly string[]).includes(raw)
        ? (raw as T)
        : fallback;
    } catch {
      return fallback;
    }
  });

  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Best-effort persistence; in-memory state still updates.
      }
    },
    [key],
  );

  return [value, set];
}
