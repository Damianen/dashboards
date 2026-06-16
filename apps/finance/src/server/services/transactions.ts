import { Prisma } from "@/generated/prisma/client";
import {
  transactionSearchSchema,
  type TransactionSearchInput,
} from "@/lib/schemas";
import {
  TRANSACTIONS_PAGE_SIZE,
  type TransactionListItem,
  type TransactionsPage,
} from "@/lib/transactions";
import { prisma } from "@/server/db";

// Read side of the transaction list: keyset pagination over (bookingDate desc,
// id desc) so the infinite scroll is stable as new rows arrive. Plus a filtered
// search used by the MCP search_transactions tool.

/** Row → wire item. Decimal → signed 2dp string, dates → YYYY-MM-DD. */
function toListItem(t: {
  id: string;
  bookingDate: Date;
  amount: Prisma.Decimal;
  currency: string;
  counterparty: string | null;
  descriptionRaw: string | null;
  account: { name: string | null; connection: { bank: string } };
}): TransactionListItem {
  return {
    id: t.id,
    bookingDate: t.bookingDate.toISOString().slice(0, 10),
    amount: t.amount.toFixed(2),
    currency: t.currency,
    counterparty: t.counterparty,
    descriptionRaw: t.descriptionRaw,
    bank: t.account.connection.bank,
    accountName: t.account.name,
  };
}

const LIST_INCLUDE = {
  account: { select: { name: true, connection: { select: { bank: true } } } },
} as const;

function encodeCursor(bookingDate: Date, id: string): string {
  return Buffer.from(`${bookingDate.toISOString()}|${id}`).toString("base64url");
}

function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function decodeCursor(cursor: string): { bookingDate: Date; id: string } | null {
  try {
    const [dateStr, id] = Buffer.from(cursor, "base64url")
      .toString("utf8")
      .split("|");
    if (!dateStr || !id) return null;
    const bookingDate = new Date(dateStr);
    if (Number.isNaN(bookingDate.getTime())) return null;
    return { bookingDate, id };
  } catch {
    return null;
  }
}

export async function listTransactions(params: {
  cursor?: string | null;
  limit?: number;
}): Promise<TransactionsPage> {
  const limit = Math.min(Math.max(params.limit ?? TRANSACTIONS_PAGE_SIZE, 1), 100);
  const decoded = params.cursor ? decodeCursor(params.cursor) : null;

  // "Older than the cursor" in descending (bookingDate, id) order.
  const where = decoded
    ? {
        OR: [
          { bookingDate: { lt: decoded.bookingDate } },
          { bookingDate: decoded.bookingDate, id: { lt: decoded.id } },
        ],
      }
    : {};

  const rows = await prisma.transaction.findMany({
    where,
    orderBy: [{ bookingDate: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: LIST_INCLUDE,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const items: TransactionListItem[] = page.map(toListItem);

  const last = page.at(-1);
  const nextCursor =
    hasMore && last ? encodeCursor(last.bookingDate, last.id) : null;

  return { items, nextCursor };
}

/**
 * Filtered, capped transaction search (read-only). Text matches counterparty /
 * description / merchantKey (case-insensitive); date and amount bounds are
 * inclusive. Internal transfers are excluded unless explicitly included. Backs
 * the MCP search_transactions tool; the schema is the single source of truth.
 */
export async function searchTransactions(
  input: TransactionSearchInput,
): Promise<TransactionListItem[]> {
  const p = transactionSearchSchema.parse(input);

  const where: Prisma.TransactionWhereInput = {};
  if (!p.includeInternal) where.isInternalTransfer = false;
  if (p.categoryId) where.categoryId = p.categoryId;

  if (p.from || p.to) {
    where.bookingDate = {
      ...(p.from ? { gte: dateOnly(p.from) } : {}),
      ...(p.to ? { lte: dateOnly(p.to) } : {}),
    };
  }
  if (p.minAmount || p.maxAmount) {
    where.amount = {
      ...(p.minAmount ? { gte: new Prisma.Decimal(p.minAmount) } : {}),
      ...(p.maxAmount ? { lte: new Prisma.Decimal(p.maxAmount) } : {}),
    };
  }
  if (p.query) {
    where.OR = [
      { counterparty: { contains: p.query, mode: "insensitive" } },
      { descriptionRaw: { contains: p.query, mode: "insensitive" } },
      { merchantKey: { contains: p.query, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.transaction.findMany({
    where,
    orderBy: [{ bookingDate: "desc" }, { id: "desc" }],
    take: p.limit,
    include: LIST_INCLUDE,
  });
  return rows.map(toListItem);
}
