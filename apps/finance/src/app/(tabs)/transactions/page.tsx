import { TransactionList } from "@/components/transactions/transaction-list";

export const dynamic = "force-dynamic";

export default function TransactionsPage() {
  return (
    <section className="flex flex-col gap-3 py-4">
      <h1 className="text-2xl font-semibold">Transactions</h1>
      <TransactionList />
    </section>
  );
}
