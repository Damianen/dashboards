// Typed keys + defaults for the generic Setting key/value store. The service
// (src/server/services/settings.ts) parses values to their real types.

export const SETTING_KEYS = {
  largeTxnThresholdEur: "large_txn_threshold_eur",
} as const;

/** Default single-outflow alert threshold in EUR (apps/finance/CLAUDE.md). */
export const DEFAULT_LARGE_TXN_THRESHOLD_EUR = "250.00";
