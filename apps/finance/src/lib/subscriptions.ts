// Wire shapes for the /subscriptions page and the MCP list_subscriptions tool.
// Costs are emitted as POSITIVE 2dp strings (a subscription is always an outflow;
// the bank-convention sign lives in RecurringSeries.expectedAmount).

export interface SubscriptionView {
  id: string;
  name: string; // description ?? merchantKey
  merchantKey: string;
  amount: string; // positive 2dp current price
  intervalDays: number;
  intervalLabel: string; // Weekly | Monthly | Quarterly | Yearly
  nextExpected: string; // YYYY-MM-DD
  monthlyEquivalent: string; // positive 2dp, normalized to a month
  missed: boolean; // overdue by ~one interval
  priceIncreased: boolean; // current price > a stable earlier level
  previousAmount: string | null; // positive 2dp prior price, when increased
}

export interface SubscriptionsResponse {
  monthlyTotal: string; // positive 2dp sum of monthly-equivalents
  currency: string;
  subscriptions: SubscriptionView[];
}
