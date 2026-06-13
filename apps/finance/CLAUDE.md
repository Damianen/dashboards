# CLAUDE.md — apps/finance

Personal finance dashboard. Two bank connections (ING NL; Revolut, licensed
in Lithuania) synced via the Enable Banking API in restricted/personal mode.
Single user. All rules in the repo root CLAUDE.md apply; this file adds the
finance-specific ones. Mirror the structure and conventions of apps/tasks.

## Money & time invariants (never violate)
- Amounts are Prisma Decimal (@db.Decimal(12,2)), never floats. Keep the
  bank's sign convention: negative = outflow, positive = inflow.
- Bucket all monthly aggregations by booking date in Europe/Amsterdam.
- A transaction is immutable after ingest, except: categoryId, merchantKey,
  isInternalTransfer, transferPairId, notes.
- Every income/expense aggregate excludes isInternalTransfer rows. No
  exceptions, anywhere — dashboard, budgets, subscriptions, MCP tools.

## Sync rules (Enable Banking / PSD2)
- Before writing or changing sync code, fetch and read
  https://enablebanking.com/docs/ for the real auth + endpoint shapes
  (JWT signed with the app private key, redirect consent flow, sessions,
  accounts, transactions, balances). Never invent endpoints or fields.
- Persist per connection: session id, account ids, valid_until (~180 days).
- PSD2 allows ~4 unattended fetches per account per day: scheduled sync runs
  at most every 6 hours. A user-triggered "Sync now" is user-present and
  exempt from that budget.
- On the first sync after a fresh consent, backfill the maximum available
  history (up to ~12 months) before switching to incremental sync.
- Incremental sync fetches from (last booking date - 3 days) for overlap.
- Dedupe: upsert on unique (accountId, externalId). If the bank gives no
  stable id, externalId = sha256(accountId|bookingDate|amount|counterparty|
  descriptionRaw). Sync must be idempotent: re-running a window is a no-op.
- Logging: counts, account ids, durations. NEVER log transaction payloads,
  IBANs, tokens, or the private key. Errors log status + EB error code only.

## Domain rules
- Internal transfers: opposite-amount transactions between two owned
  accounts within ±2 days are a pair. Set isInternalTransfer on BOTH and
  link them via transferPairId. Nearest booking date wins when multiple
  candidates exist; a transaction can belong to at most one pair.
- Categorization: normalizeMerchant() lowercases, strips acquirer prefixes
  (ccv*, zettle_*, bck*, sumup*), payment-reference noise, and trailing
  city/terminal tokens to produce merchantKey. CategoryRule rows (priority
  asc; field merchant|counterparty_iban|description; match
  contains|regex|exact) are applied at ingest; first match wins. Manual
  categorization always beats rules and is never overwritten by re-runs.
  Rules are DATA in the DB, never hardcoded — no personal merchant names,
  employers, or IBANs in committed code.
- Budgets: monthly limit per category. Alerts at 80% and 100% of limit via
  ntfy. NotificationLog has a unique dedupeKey (e.g. budgetId:YYYY-MM:80)
  so an alert fires at most once.
- Recurring detection: group expenses by merchantKey; a series exists when
  intervals cluster near 7/30/90/365 days (±3) and amounts stay within
  ±10%. Track expectedAmount, intervalDays, lastSeenDate, active; flag
  price increases and missed occurrences.

## Schema (Prisma models — extend, don't rename)
BankConnection, Account, Transaction, Category, CategoryRule, Budget,
BalanceSnapshot (unique accountId+date), RecurringSeries, NotificationLog.

## Privacy (the repo is PUBLIC)
- Secrets only via env / mounted files. No real financial data in code,
  fixtures, seeds, tests, or migration files. prisma/seed.ts is obviously
  fake. When in doubt, leave it out.

## MCP (root pattern applies)
Tools: search_transactions, get_spending_summary, get_budget_status,
list_subscriptions, get_net_worth, categorize_transaction (the ONLY write
tool). No delete or bulk tools. Reuse the Zod schemas; descriptions written
for an agent; bearer = FINANCE_MCP_TOKEN with timing-safe compare.

## Testing
Pure logic (normalizeMerchant, rule precedence, transfer pairing,
recurrence detection, budget pacing, dedupe hashing, sync windows) =
table-driven vitest, no DB. Prisma-touching services = integration tests
against finance_dev.
