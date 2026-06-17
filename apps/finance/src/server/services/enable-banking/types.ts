// Enable Banking API response shapes — only the fields this app consumes.
// Field names mirror the EB REST API exactly (snake_case). See
// https://enablebanking.com/docs/api/reference/ — never invent fields.

export interface EbAmount {
  amount: string; // decimal string, always positive
  currency: string;
}

export interface EbParty {
  name?: string;
}

export interface EbAccountIdentification {
  iban?: string;
}

export interface EbBankTransactionCode {
  code?: string;
  sub_code?: string;
  description?: string;
}

export interface EbTransaction {
  entry_reference?: string;
  transaction_id?: string;
  booking_date?: string; // YYYY-MM-DD
  value_date?: string; // YYYY-MM-DD
  transaction_date?: string; // YYYY-MM-DD
  status?: string; // BOOK | PENDING
  credit_debit_indicator?: string; // CRDT (inflow) | DBIT (outflow)
  transaction_amount: EbAmount;
  creditor?: EbParty;
  debtor?: EbParty;
  creditor_account?: EbAccountIdentification;
  debtor_account?: EbAccountIdentification;
  remittance_information?: string[];
  bank_transaction_code?: EbBankTransactionCode;
}

export interface EbAccount {
  uid: string;
  account_id?: EbAccountIdentification;
  name?: string;
  currency?: string;
  cash_account_type?: string;
  product?: string;
}

export interface EbAccess {
  valid_until?: string; // ISO datetime
}

export interface EbAspspRef {
  name: string;
  country: string;
}

export interface EbStartAuthResponse {
  url: string;
  authorization_id?: string;
  psu_id_hash?: string;
}

export interface EbSession {
  session_id: string;
  accounts: EbAccount[];
  aspsp?: EbAspspRef;
  psu_type?: string;
  access?: EbAccess;
}

export interface EbSessionStatus {
  session_id: string;
  status?: string; // AUTHORIZED | ...
  access?: EbAccess;
}

export interface EbBalance {
  name?: string;
  balance_amount: EbAmount;
  balance_type?: string; // CLBD | CLAV | ITAV | ...
  reference_date?: string; // YYYY-MM-DD
}

export interface EbBalancesResponse {
  balances: EbBalance[];
}

export interface EbTransactionsResponse {
  transactions: EbTransaction[];
  continuation_key?: string;
}

export interface EbAspsp {
  name: string;
  country: string;
}

export interface EbAspspsResponse {
  aspsps: EbAspsp[];
}
