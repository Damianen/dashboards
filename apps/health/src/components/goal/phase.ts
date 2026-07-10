import type { GoalPhase } from "@/lib/goals";

/** UI labels for the goal phases (the enum values stay SCREAMING_CASE). */
export const GOAL_PHASE_LABELS: Record<GoalPhase, string> = {
  CUT: "Cut",
  BULK: "Bulk",
  MAINTAIN: "Maintain",
};

/** "−0.50" / "+0.40" kg/wk — explicit sign, matching the notification copy. */
export function signedRate(rateKgPerWeek: number): string {
  const sign = rateKgPerWeek < 0 ? "−" : "+";
  return `${sign}${Math.abs(rateKgPerWeek).toFixed(2)}`;
}
