import {
  TRANSACTIONS_PAGE_SIZE,
  type TransactionListItem,
  type TransactionsPage,
} from "@/lib/transactions";
import { prisma } from "@/server/db";

// Read side of the transaction list: keyset pagination over (bookingDate desc,
// id desc) so the infinite scroll is stable as new rows arrive.

function encodeCursor(bookingDate: Date, id: string): string {
  return Buffer.from(`${bookingDate.toISOString()}|${id}`).toString("base64url");
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
    include: {
      account: { select: { name: true, connection: { select: { bank: true } } } },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const items: TransactionListItem[] = page.map((t) => ({
    id: t.id,
    bookingDate: t.bookingDate.toISOString().slice(0, 10),
    amount: t.amount.toFixed(2),
    currency: t.currency,
    counterparty: t.counterparty,
    descriptionRaw: t.descriptionRaw,
    bank: t.account.connection.bank,
    accountName: t.account.name,
  }));

  const last = page.at(-1);
  const nextCursor =
    hasMore && last ? encodeCursor(last.bookingDate, last.id) : null;

  return { items, nextCursor };
}
