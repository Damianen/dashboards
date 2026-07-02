// One-tap presets for the quick-log forms. UI conveniences only — deliberately
// separate from lib/water-defaults.ts, whose constants mirror the SQL view's
// COALESCE literals and are pinned by the seam test.

export const WATER_PRESETS_ML = [250, 500, 750] as const;

export const STIMULANT_PRESETS_MG = [100, 200] as const;
