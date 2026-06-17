import { BudgetList } from "@/components/budgets/budget-list";

export const dynamic = "force-dynamic";

export default function BudgetsPage() {
  return (
    <section className="flex flex-col gap-3 py-4">
      <h1 className="text-2xl font-semibold">Budgets</h1>
      <p className="text-sm text-muted-foreground">
        Monthly limits per category. The marker shows where the month should be
        today.
      </p>
      <BudgetList />
    </section>
  );
}
