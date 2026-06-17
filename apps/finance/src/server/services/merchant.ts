// normalizeMerchant turns a messy bank descriptor into a stable merchantKey used
// by the rule engine and (later) recurring detection. It lowercases, strips
// acquirer prefixes (ccv*, zettle_*, bck*, sumup*), payment-reference noise
// (terminal/transaction ids, dates, times, long digit runs) and trailing
// city/country tokens, then collapses whitespace. Pure: no DB, no clock.

// Acquirer prefixes are anchored at the start and stripped repeatedly so stacked
// prefixes (e.g. "ccv*sumup ...") fully unwind. Requires a trailing separator so
// a real name merely starting with these letters is never truncated.
const ACQUIRER_PREFIX = /^(?:ccv|zettle|bck|sumup)[\s*_]+/;

// Payment-reference noise, stripped while the original separators are intact.
const NOISE = [
  /\b\d{1,2}[:.]\d{2}(?::\d{2})?\b/g, // times: 13:45, 13.45.30
  /\b\d{1,2}-\d{1,2}-\d{2,4}\b/g, // dates: 16-06-2026
  /\b(?:term|trm|trx|pas|ref|aut)\s*\d+\b/g, // terminal / reference ids
  /\b\d{4,}\b/g, // long digit runs (card/terminal numbers)
];

// Separators glued into descriptors; flattened to spaces after noise removal.
const SEPARATORS = /[_/*.,;:#|()\-]+/g;

// Trailing-only city/country tokens (synthetic set). Anchored at the end so a
// merchant literally named after a place keeps it unless it is the last token.
const TRAILING_LOCATION =
  /\s+(?:amsterdam|den haag|utrecht|rotterdam|eindhoven|nl)$/;

export function normalizeMerchant(raw: string | null): string | null {
  if (!raw) return null;

  let s = raw.toLowerCase().trim();

  // 1. Strip stacked acquirer prefixes.
  let prev: string;
  do {
    prev = s;
    s = s.replace(ACQUIRER_PREFIX, "");
  } while (s !== prev);

  // 2. Remove reference/date/time noise (separators still intact for matching).
  for (const re of NOISE) s = s.replace(re, " ");

  // 3. Flatten remaining separators and collapse whitespace.
  s = s.replace(SEPARATORS, " ").replace(/\s+/g, " ").trim();

  // 4. Drop trailing location tokens (repeat for stacked ones).
  do {
    prev = s;
    s = s.replace(TRAILING_LOCATION, "").trim();
  } while (s !== prev);

  return s.length ? s : null;
}
