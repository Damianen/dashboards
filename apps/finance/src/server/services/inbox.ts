import {
  INBOX_PAGE_SIZE,
  type InboxItem,
  type InboxPage,
} from "@/lib/inbox";
import { prisma } from "@/server/db";

// Read side of the inbox: uncategorized (categoryId IS NULL), non-transfer rows,
// newest first. Same keyset pagination as the transaction list so the queue is
// stable while new rows arrive.

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

export async function listInbox(params: {
  cursor?: string | null;
  limit?: number;
}): Promise<InboxPage> {
  const limit = Math.min(Math.max(params.limit ?? INBOX_PAGE_SIZE, 1), 100);
  const decoded = params.cursor ? decodeCursor(params.cursor) : null;

  const cursorWhere = decoded
    ? {
        OR: [
          { bookingDate: { lt: decoded.bookingDate } },
          { bookingDate: decoded.bookingDate, id: { lt: decoded.id } },
        ],
      }
    : {};

  const rows = await prisma.transaction.findMany({
    where: { categoryId: null, isInternalTransfer: false, ...cursorWhere },
    orderBy: [{ bookingDate: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: {
      account: { select: { name: true, connection: { select: { bank: true } } } },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const items: InboxItem[] = page.map((t) => ({
    id: t.id,
    bookingDate: t.bookingDate.toISOString().slice(0, 10),
    amount: t.amount.toFixed(2),
    currency: t.currency,
    counterparty: t.counterparty,
    descriptionRaw: t.descriptionRaw,
    merchantKey: t.merchantKey,
    bank: t.account.connection.bank,
    accountName: t.account.name,
  }));

  const last = page.at(-1);
  const nextCursor =
    hasMore && last ? encodeCursor(last.bookingDate, last.id) : null;

  return { items, nextCursor };
}
