// Builds the muted one-line summary shown on a template card, e.g.
// "Bench 4×6–10 · OHP 3×8–12 · +3": the first two exercises spelled out, then a
// "+N" tail for the rest. Pure and structural so it stays free of Prisma/Zod and
// is independently testable.

/** The minimal exercise shape the summary needs (a structural subset of the
 *  TemplateExerciseView the API returns). */
export interface SummaryExercise {
  exerciseName: string;
  targetType: "REPS" | "VOLUME";
  targetSets: number | null;
  repMin: number | null;
  repMax: number | null;
  targetVolumeKg: number | null;
}

/** Number of exercises spelled out before collapsing the rest into "+N". */
const SHOWN = 2;

function describe(e: SummaryExercise): string {
  if (e.targetType === "REPS") {
    return `${e.exerciseName} ${e.targetSets}×${e.repMin}–${e.repMax}`;
  }
  return `${e.exerciseName} ${e.targetVolumeKg} kg`;
}

/** A " · "-joined summary of the first two exercises, with " · +N" appended when
 *  more remain. Empty list → empty string (the card simply omits the line). */
export function templateSummary(exercises: SummaryExercise[]): string {
  if (exercises.length === 0) return "";
  const parts = exercises.slice(0, SHOWN).map(describe);
  const rest = exercises.length - SHOWN;
  if (rest > 0) parts.push(`+${rest}`);
  return parts.join(" · ");
}
