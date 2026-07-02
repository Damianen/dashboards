// Client-safe wire DTOs for the water/stimulant quick-log endpoints (no Prisma /
// server imports). Mirrors the JSON serialization: Decimals → strings, dates →
// ISO strings, @db.Date days → UTC-midnight ISO strings.

/** A water entry as POST /api/water and GET /api/water/entries serialize it. */
export interface WaterEntryDTO {
  id: string;
  loggedAt: string;
  /** UTC-midnight ISO of the civil day (a serialized @db.Date column). */
  day: string;
  amountMl: number;
  origin: string;
}

/** A stimulant entry as the stimulants endpoints serialize it. */
export interface StimulantEntryDTO {
  id: string;
  loggedAt: string;
  /** UTC-midnight ISO of the civil day (a serialized @db.Date column). */
  day: string;
  substance: string;
  /** Decimal column — arrives as a string; the input amount stays the number source. */
  amountMg: string;
  origin: string;
  notes: string | null;
}

/** POST /api/stimulants response: the created entry + the day's new water target. */
export interface LogStimulantResponseDTO {
  entry: StimulantEntryDTO;
  waterTargetMl: number;
}

/** Civil day of a serialized @db.Date ("2026-07-02T00:00:00.000Z" → "2026-07-02").
 *  The stored value IS the civil date at UTC midnight, so slicing is exact — the
 *  client-side twin of civilDay() in lib/dates.ts, for wire strings. */
export function entryDayOf(dtoDay: string): string {
  return dtoDay.slice(0, 10);
}
