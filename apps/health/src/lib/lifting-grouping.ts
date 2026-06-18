// Pure grouping + volume math for lifting sessions. No DB and no Prisma.Decimal —
// the service coerces Decimal → number before calling in, so everything here is
// plain numbers and unit-testable without a database (CLAUDE.md "Definition of done").

import { formatNumber } from "./format";

/** One logged set with its exercise denormalised. `weightKg`/`rpe` are already
 *  numeric (the service converts Prisma.Decimal → number). */
export interface PlainSet {
  id: string;
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  reps: number;
  weightKg: number;
  rpe: number | null;
  isWarmup: boolean;
}

/** A session's sets for one exercise, with that exercise's working volume. */
export interface ExerciseGroup {
  exerciseId: string;
  exerciseName: string;
  sets: PlainSet[];
  volumeKg: number;
  workingSets: number;
}

/** Σ reps × weightKg over NON-warmup sets — the single lifting-volume formula.
 *  Warmups never count toward volume (CLAUDE.md domain guardrail). */
function workingVolume(sets: PlainSet[]): number {
  return sets
    .filter((s) => !s.isWarmup)
    .reduce((sum, s) => sum + s.reps * s.weightKg, 0);
}

/**
 * Group sets by exercise, preserving first-appearance order (the order each
 * exercise was first logged in the session). `sets` must be pre-sorted by
 * loggedAt asc; within each group the sets are then sorted by setNumber asc.
 */
export function groupSetsByExercise(sets: PlainSet[]): ExerciseGroup[] {
  const groups = new Map<string, ExerciseGroup>();
  for (const set of sets) {
    let group = groups.get(set.exerciseId);
    if (!group) {
      group = {
        exerciseId: set.exerciseId,
        exerciseName: set.exerciseName,
        sets: [],
        volumeKg: 0,
        workingSets: 0,
      };
      groups.set(set.exerciseId, group);
    }
    group.sets.push(set);
  }
  for (const group of groups.values()) {
    group.sets.sort((a, b) => a.setNumber - b.setNumber);
    group.volumeKg = workingVolume(group.sets);
    group.workingSets = group.sets.filter((s) => !s.isWarmup).length;
  }
  return [...groups.values()];
}

/** Total working volume of a session (Σ over its exercise groups). */
export function sessionVolumeKg(groups: ExerciseGroup[]): number {
  return groups.reduce((sum, g) => sum + g.volumeKg, 0);
}

/** Total non-warmup set count of a session. */
export function sessionWorkingSets(groups: ExerciseGroup[]): number {
  return groups.reduce((sum, g) => sum + g.workingSets, 0);
}

/** The minimum a "last time" summary needs from a prior session's sets. */
export interface LastTimeSet {
  reps: number;
  weightKg: number;
  isWarmup: boolean;
}

/**
 * One-line recap of the working sets in a previous session. Uniform sets collapse
 * to "3 × 8 @ 80 kg"; otherwise each set is listed as "8 @ 80kg, 6 @ 75kg".
 * Returns null when there were no working sets (only warmups, or nothing).
 */
export function summarizeLastTime(sets: LastTimeSet[]): string | null {
  const working = sets.filter((s) => !s.isWarmup);
  const first = working[0];
  if (!first) return null;
  const uniform = working.every(
    (s) => s.reps === first.reps && s.weightKg === first.weightKg,
  );
  if (uniform) {
    return `${working.length} × ${first.reps} @ ${formatNumber(first.weightKg, 1)} kg`;
  }
  return working
    .map((s) => `${s.reps} @ ${formatNumber(s.weightKg, 1)}kg`)
    .join(", ");
}

/**
 * Apply one stepper increment: value + dir × step, clamped to [min, max] and
 * rounded to the step's decimal precision so fractional steps (2.5, 0.5) don't
 * accumulate floating-point drift.
 */
export function clampStep(
  value: number,
  dir: 1 | -1,
  step: number,
  min: number,
  max: number,
): number {
  const clamped = Math.min(max, Math.max(min, value + dir * step));
  const decimals = (String(step).split(".")[1] ?? "").length;
  return Number(clamped.toFixed(decimals));
}
