// Wire shapes for the inbox (uncategorized queue) and the category picker.
// Plain types only — Decimal becomes a signed 2dp string, dates become
// YYYY-MM-DD.

export interface InboxItem {
  id: string;
  bookingDate: string; // YYYY-MM-DD
  amount: string; // signed, two decimals: "-12.34"
  currency: string;
  counterparty: string | null;
  descriptionRaw: string | null;
  merchantKey: string | null;
  bank: string; // "ING" | "REVOLUT" | "KLARNA"
  accountName: string | null;
}

export interface InboxPage {
  items: InboxItem[];
  nextCursor: string | null;
}

export interface CategoryListItem {
  id: string;
  name: string;
  kind: string; // "income" | "expense"
  color: string;
}

export const INBOX_PAGE_SIZE = 50;
