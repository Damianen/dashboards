import { describe, expect, it } from "vitest";

import { CreditDebit, TransactionStatus } from "@/generated/prisma/client";

import {
  computeExternalId,
  creditDebitOf,
  deriveCounterparty,
  deriveDescription,
  mapTransaction,
  signedAmount,
  statusOf,
} from "./mapping";
import type { EbTransaction } from "./types";

// Minimal EB transaction with sane defaults; override per case.
function tx(overrides: Partial<EbTransaction> = {}): EbTransaction {
  return {
    booking_date: "2026-06-10",
    credit_debit_indicator: "DBIT",
    transaction_amount: { amount: "12.34", currency: "EUR" },
    ...overrides,
  };
}

describe("signedAmount", () => {
  const cases: {
    name: string;
    indicator: string;
    amount: string;
    expected: string;
  }[] = [
    { name: "CRDT → positive", indicator: "CRDT", amount: "10.00", expected: "10" },
    { name: "DBIT → negative", indicator: "DBIT", amount: "10.00", expected: "-10" },
    {
      name: "DBIT keeps magnitude from a positive EB amount",
      indicator: "DBIT",
      amount: "3.50",
      expected: "-3.5",
    },
    {
      name: "DBIT on an already-negative amount stays negative once",
      indicator: "DBIT",
      amount: "-3.50",
      expected: "-3.5",
    },
    {
      name: "CRDT normalizes a negative EB amount to positive",
      indicator: "CRDT",
      amount: "-7.00",
      expected: "7",
    },
  ];

  it.each(cases)("$name", ({ indicator, amount, expected }) => {
    const result = signedAmount(
      tx({ credit_debit_indicator: indicator, transaction_amount: { amount, currency: "EUR" } }),
    );
    expect(result.toString()).toBe(expected);
  });

  it("preserves two-decimal scale for storage", () => {
    expect(
      signedAmount(tx({ credit_debit_indicator: "DBIT", transaction_amount: { amount: "1234.5", currency: "EUR" } })).toFixed(2),
    ).toBe("-1234.50");
  });
});

describe("creditDebitOf / statusOf", () => {
  it("maps the indicator", () => {
    expect(creditDebitOf(tx({ credit_debit_indicator: "CRDT" }))).toBe(CreditDebit.CRDT);
    expect(creditDebitOf(tx({ credit_debit_indicator: "DBIT" }))).toBe(CreditDebit.DBIT);
    // Anything not DBIT is treated as a credit.
    expect(creditDebitOf(tx({ credit_debit_indicator: undefined }))).toBe(CreditDebit.CRDT);
  });

  it("maps the status, defaulting to BOOK", () => {
    expect(statusOf(tx({ status: "PENDING" }))).toBe(TransactionStatus.PENDING);
    expect(statusOf(tx({ status: "BOOK" }))).toBe(TransactionStatus.BOOK);
    expect(statusOf(tx({ status: undefined }))).toBe(TransactionStatus.BOOK);
  });
});

describe("deriveCounterparty", () => {
  const outflow = tx({
    credit_debit_indicator: "DBIT",
    creditor: { name: "  Coffee Bar  " },
    creditor_account: { iban: "NL00BANK0123456789" },
    debtor: { name: "Me" },
    debtor_account: { iban: "NL00MINE0000000000" },
  });
  const inflow = tx({
    credit_debit_indicator: "CRDT",
    debtor: { name: "Employer BV" },
    debtor_account: { iban: "NL00WORK1111111111" },
    creditor: { name: "Me" },
  });

  it("uses the creditor for an outflow", () => {
    expect(deriveCounterparty(outflow)).toEqual({
      name: "Coffee Bar",
      iban: "NL00BANK0123456789",
    });
  });

  it("uses the debtor for an inflow", () => {
    expect(deriveCounterparty(inflow)).toEqual({
      name: "Employer BV",
      iban: "NL00WORK1111111111",
    });
  });

  it("returns nulls when the party is missing", () => {
    expect(deriveCounterparty(tx({ creditor: undefined, creditor_account: undefined }))).toEqual({
      name: null,
      iban: null,
    });
  });
});

describe("deriveDescription", () => {
  it("joins and trims remittance lines", () => {
    expect(
      deriveDescription(tx({ remittance_information: ["  Invoice 123 ", "thanks "] })),
    ).toBe("Invoice 123 thanks");
  });

  it("is null when there is nothing meaningful", () => {
    expect(deriveDescription(tx({ remittance_information: ["  ", ""] }))).toBeNull();
    expect(deriveDescription(tx({ remittance_information: undefined }))).toBeNull();
  });
});

describe("computeExternalId", () => {
  const ACC = "acc_1";

  it("prefers entry_reference over everything", () => {
    expect(
      computeExternalId(ACC, tx({ entry_reference: "ER-1", transaction_id: "TX-1" })),
    ).toBe("ER-1");
  });

  it("falls back to transaction_id when entry_reference is absent", () => {
    expect(computeExternalId(ACC, tx({ transaction_id: "TX-1" }))).toBe("TX-1");
  });

  it("hashes immutable fields when no stable id exists", () => {
    const id = computeExternalId(ACC, tx());
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for identical input", () => {
    expect(computeExternalId(ACC, tx())).toBe(computeExternalId(ACC, tx()));
  });

  const base = () =>
    tx({
      booking_date: "2026-06-10",
      credit_debit_indicator: "DBIT",
      transaction_amount: { amount: "12.34", currency: "EUR" },
      creditor: { name: "Shop" },
      remittance_information: ["ref-1"],
    });

  const distinct: { name: string; mutate: (t: EbTransaction) => EbTransaction }[] = [
    { name: "account id", mutate: (t) => t },
    { name: "booking date", mutate: (t) => ({ ...t, booking_date: "2026-06-11" }) },
    { name: "amount", mutate: (t) => ({ ...t, transaction_amount: { amount: "99.99", currency: "EUR" } }) },
    { name: "sign", mutate: (t) => ({ ...t, credit_debit_indicator: "CRDT" }) },
    { name: "counterparty", mutate: (t) => ({ ...t, creditor: { name: "Other" } }) },
    { name: "description", mutate: (t) => ({ ...t, remittance_information: ["ref-2"] }) },
  ];

  it.each(distinct)("a different $name yields a different hash", ({ name, mutate }) => {
    const baseId = computeExternalId(ACC, base());
    const otherAccount = name === "account id" ? "acc_2" : ACC;
    expect(computeExternalId(otherAccount, mutate(base()))).not.toBe(baseId);
  });
});

describe("mapTransaction", () => {
  it("maps a full booked outflow", () => {
    const mapped = mapTransaction(
      "acc_1",
      tx({
        entry_reference: "ER-9",
        booking_date: "2026-06-10",
        value_date: "2026-06-11",
        credit_debit_indicator: "DBIT",
        transaction_amount: { amount: "42.00", currency: "EUR" },
        creditor: { name: "Grocer" },
        creditor_account: { iban: "NL00BANK0123456789" },
        remittance_information: ["weekly shop"],
        bank_transaction_code: { code: "PMNT", sub_code: "RCDT" },
        status: "BOOK",
      }),
    );
    expect(mapped.externalId).toBe("ER-9");
    expect(mapped.bookingDate.toISOString()).toBe("2026-06-10T00:00:00.000Z");
    expect(mapped.valueDate?.toISOString()).toBe("2026-06-11T00:00:00.000Z");
    expect(mapped.amount.toFixed(2)).toBe("-42.00");
    expect(mapped.currency).toBe("EUR");
    expect(mapped.creditDebit).toBe(CreditDebit.DBIT);
    expect(mapped.status).toBe(TransactionStatus.BOOK);
    expect(mapped.counterparty).toBe("Grocer");
    expect(mapped.counterpartyIban).toBe("NL00BANK0123456789");
    expect(mapped.descriptionRaw).toBe("weekly shop");
    expect(mapped.bankTransactionCode).toBe("PMNT/RCDT");
  });

  it("falls back to value_date when booking_date is missing", () => {
    const mapped = mapTransaction("acc_1", tx({ booking_date: undefined, value_date: "2026-05-01" }));
    expect(mapped.bookingDate.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });
});
