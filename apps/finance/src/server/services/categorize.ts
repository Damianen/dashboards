import { RuleField, RuleMatch } from "@/generated/prisma/client";
import { categorizeSchema, type CategorizeInput } from "@/lib/schemas";
import { prisma } from "@/server/db";

import { NotFoundError } from "./errors";
import { normalizeMerchant } from "./merchant";
import { pickCategory, type Rule, type RuleContext } from "./rules";

// Categorization service. normalizeMerchant + the rule engine are pure; this
// layer loads rules/rows, applies them, and persists the mutable fields
// (merchantKey, categoryId). Manual categorization (a non-null categoryId) is
// never overwritten by any re-run — the null sentinel is the whole guarantee.

export interface CategorizeResult {
  id: string;
  categoryId: string;
  ruleCreated: boolean;
  alsoCategorized: number;
}

/** All rules, ordered so callers (and pickCategory) see priority precedence. */
export async function loadActiveRules(): Promise<Rule[]> {
  return prisma.categoryRule.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    select: {
      categoryId: true,
      priority: true,
      field: true,
      match: true,
      value: true,
    },
  });
}

function contextOf(row: {
  merchantKey: string | null;
  counterpartyIban: string | null;
  descriptionRaw: string | null;
}): RuleContext {
  return {
    merchantKey: row.merchantKey,
    counterpartyIban: row.counterpartyIban,
    descriptionRaw: row.descriptionRaw,
  };
}

/**
 * Enrich freshly-ingested rows: compute merchantKey and apply rules. Scoped to
 * rows with no merchantKey yet AND no category, so it is cheap, idempotent, and
 * self-heals slice-1 rows that predate categorization.
 */
export async function categorizeNewTransactions(): Promise<{
  keyed: number;
  categorized: number;
}> {
  const rules = await loadActiveRules();
  const rows = await prisma.transaction.findMany({
    where: { categoryId: null, merchantKey: null },
    select: {
      id: true,
      counterparty: true,
      counterpartyIban: true,
      descriptionRaw: true,
    },
  });

  let categorized = 0;
  for (const row of rows) {
    const merchantKey = normalizeMerchant(row.counterparty ?? row.descriptionRaw);
    const categoryId = pickCategory(rules, {
      merchantKey,
      counterpartyIban: row.counterpartyIban,
      descriptionRaw: row.descriptionRaw,
    });
    await prisma.transaction.update({
      where: { id: row.id },
      data: { merchantKey, ...(categoryId ? { categoryId } : {}) },
    });
    if (categoryId) categorized++;
  }

  if (rows.length > 0) {
    console.info(`[categorize] keyed=${rows.length} categorized=${categorized}`);
  }
  return { keyed: rows.length, categorized };
}

/**
 * Re-apply rules to uncategorized history only. Never touches a row that already
 * has a category (manual picks are non-null), so manual categorization is safe.
 */
export async function rerunRulesOnUncategorized(): Promise<{
  scanned: number;
  categorized: number;
}> {
  const rules = await loadActiveRules();
  const rows = await prisma.transaction.findMany({
    where: { categoryId: null },
    select: {
      id: true,
      counterparty: true,
      counterpartyIban: true,
      descriptionRaw: true,
      merchantKey: true,
    },
  });

  let categorized = 0;
  for (const row of rows) {
    // Recompute the key so normalization improvements heal old rows too.
    const merchantKey =
      normalizeMerchant(row.counterparty ?? row.descriptionRaw) ??
      row.merchantKey;
    const categoryId = pickCategory(rules, contextOf({ ...row, merchantKey }));
    const data: { merchantKey?: string | null; categoryId?: string } = {};
    if (merchantKey !== row.merchantKey) data.merchantKey = merchantKey;
    if (categoryId) data.categoryId = categoryId;
    if (Object.keys(data).length > 0) {
      await prisma.transaction.update({ where: { id: row.id }, data });
    }
    if (categoryId) categorized++;
  }

  console.info(`[categorize] rerun scanned=${rows.length} categorized=${categorized}`);
  return { scanned: rows.length, categorized };
}

/**
 * Manually categorize one transaction (always wins over rules). Optionally
 * create a contains-rule on its merchantKey and apply it to other still-
 * uncategorized rows of the same merchant.
 */
export async function categorizeTransaction(
  input: CategorizeInput,
): Promise<CategorizeResult> {
  const data = categorizeSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.findUnique({
      where: { id: data.transactionId },
    });
    if (!transaction) throw new NotFoundError("transaction", data.transactionId);

    const category = await tx.category.findUnique({
      where: { id: data.categoryId },
    });
    if (!category) throw new NotFoundError("category", data.categoryId);

    await tx.transaction.update({
      where: { id: data.transactionId },
      data: { categoryId: data.categoryId },
    });

    let ruleCreated = false;
    let alsoCategorized = 0;

    if (data.createRule && transaction.merchantKey) {
      const value = transaction.merchantKey;
      const existing = await tx.categoryRule.findFirst({
        where: {
          categoryId: data.categoryId,
          field: RuleField.merchant,
          match: RuleMatch.contains,
          value,
        },
      });
      if (!existing) {
        await tx.categoryRule.create({
          data: {
            categoryId: data.categoryId,
            field: RuleField.merchant,
            match: RuleMatch.contains,
            value,
            priority: 100,
          },
        });
        ruleCreated = true;
      }
      // Propagate to the rest of this merchant's untriaged, non-transfer rows.
      const res = await tx.transaction.updateMany({
        where: {
          id: { not: data.transactionId },
          categoryId: null,
          isInternalTransfer: false,
          merchantKey: value,
        },
        data: { categoryId: data.categoryId },
      });
      alsoCategorized = res.count;
    }

    return {
      id: data.transactionId,
      categoryId: data.categoryId,
      ruleCreated,
      alsoCategorized,
    };
  });
}
