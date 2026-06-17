// Wire shapes for the budgets page. Plain types only — Decimal becomes a 2dp
// string, month becomes "YYYY-MM". Pacing fractions are plain numbers in [0, ∞).

import type { BudgetStatus } from "@/lib/budget-pacing";

export interface BudgetView {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  month: string; // "YYYY-MM"
  limit: string; // 2dp, positive
  spent: string; // 2dp, positive month-to-date spend
  spentFraction: number; // spent / limit
  paceFraction: number; // fraction of the month elapsed today
  projected: string; // 2dp, month-end projection
  status: BudgetStatus;
}

export interface BudgetsResponse {
  month: string; // "YYYY-MM" of the current month
  budgets: BudgetView[];
}
