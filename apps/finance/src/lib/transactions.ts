// Wire shape shared by the /api/transactions route and the client list. Plain
// types only — Decimal becomes a signed 2dp string, dates become YYYY-MM-DD.

export interface TransactionListItem {
  id: string;
  bookingDate: string; // YYYY-MM-DD
  amount: string; // signed, two decimals: "-12.34"
  currency: string;
  counterparty: string | null;
  descriptionRaw: string | null;
  bank: string; // "ING" | "REVOLUT" | "KLARNA"
  accountName: string | null;
}

export interface TransactionsPage {
  items: TransactionListItem[];
  nextCursor: string | null;
}

export const TRANSACTIONS_PAGE_SIZE = 50;
