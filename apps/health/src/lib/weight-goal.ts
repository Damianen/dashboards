// Project when a body-weight goal is reached at the current measured trend. Pure and
// side-effect-free (CLAUDE.md "Definition of done"): the service supplies the current
// weight, the goal, and the weight slope (reuse weightTrendKgPerWeek from lib/tdee).
// This is an intake/weight-trend projection — it NEVER nets against device expenditure.

export interface GoalProjection {
  /** Weeks until the goal at the current trend; 0 when already reached/passed in the
   *  goal direction; null when the trend isn't moving toward the goal (incl. flat). */
  weeksToGoal: number | null;
  /** True when the weight trend moves toward the goal (or the goal is already met). */
  onTrack: boolean;
}

/** Within this many kg of the goal counts as reached (avoids a divide-by-tiny ETA). */
const REACHED_TOLERANCE_KG = 0.1;

/**
 * Weeks-to-goal from the current weight, the goal, and the weekly weight slope.
 * `onTrack` is true only when the trend's sign matches the direction still to travel
 * (or the goal is already met). A flat or wrong-way trend returns
 * `{ weeksToGoal: null, onTrack: false }` — there is no honest ETA.
 */
export function projectGoalEta({
  currentKg,
  goalKg,
  slopeKgPerWeek,
}: {
  currentKg: number;
  goalKg: number;
  slopeKgPerWeek: number;
}): GoalProjection {
  const remaining = goalKg - currentKg; // > 0 ⇒ must gain, < 0 ⇒ must lose
  if (Math.abs(remaining) <= REACHED_TOLERANCE_KG) {
    return { weeksToGoal: 0, onTrack: true };
  }
  // The trend must point the same way as the distance left to travel.
  if (slopeKgPerWeek === 0 || Math.sign(slopeKgPerWeek) !== Math.sign(remaining)) {
    return { weeksToGoal: null, onTrack: false };
  }
  return { weeksToGoal: remaining / slopeKgPerWeek, onTrack: true };
}
