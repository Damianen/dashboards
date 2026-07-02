// The app's two rounding idioms, defined once. Pure and client-safe.

/** Round to 1 decimal place — the macro-snapshot idiom. */
export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Round to the nearest 0.5 kg — plate-loading weights. */
export function round05(v: number): number {
  return Math.round(v * 2) / 2;
}
