/**
 * Fallback defaults for the water-target formula. Must match the COALESCE
 * literals in prisma/views/daily_summary.sql (pinned by summary-seam.test.ts);
 * the SQL view stays the single implementation of the formula itself.
 */
export const DEFAULT_BASE_TARGET_ML = 2500;
export const DEFAULT_ML_PER_MG_STIMULANT = 1.0;
