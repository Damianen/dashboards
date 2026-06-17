// Shared formatters for the dashboard. Aggregates arrive as EUR-denominated 2dp
// strings; the React layer only formats (never aggregates).

const eur = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
});

export function formatMoney(amount: string | number): string {
  return eur.format(Number(amount));
}

const monthFmt = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  timeZone: "Europe/Amsterdam",
});

/** "2026-06" -> "Jun". */
export function formatMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  return monthFmt.format(new Date(Date.UTC(year, month - 1, 1)));
}
