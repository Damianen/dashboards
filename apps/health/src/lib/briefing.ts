// Pure briefing engine: rotation advance, the advisory session suggestion, mode
// resolution, the section DTOs, and the collapsed one-liner headlines. No I/O —
// the composition service (src/server/services/briefing.ts) feeds it data from
// the existing services and never re-derives their math (CLAUDE.md).
//
// The suggestion is a HEURISTIC over the user's own trend data, never health or
// medical advice, and it never blocks or auto-starts anything.

import type { GoalPhase } from "@/lib/goals";
import { formatLiters } from "@/lib/notifications";
import type { RecoveryStatus } from "@/lib/recovery";
import type {
  BriefingMode,
  RotationEntry,
  SuggestionThresholds,
} from "@/lib/schemas/briefing";
import type { SupplementTimeGroup } from "@/lib/schemas/supplement";
import type { Confidence } from "@/lib/tdee";

/** Caveat rendered with every suggestion (UI card + MCP payload). */
export const SUGGESTION_CAVEAT =
  "A heuristic from your own trend data — not medical advice. It never blocks starting any workout.";

export type SuggestionBand = "good" | "moderate" | "poor";
export type SuggestionKind = "PLANNED" | "LIGHTER" | "REST";

export interface SessionSuggestion {
  kind: SuggestionKind;
  /** The rotation entry's template — kept even when kind is REST (the "light
   *  alternative" the user may still start); null only for a planned REST entry. */
  templateId: string | null;
  reason: string;
}

/** Recovery engine → band. `insufficient` returns null so callers fall back to readiness. */
export function bandFromRecovery(status: RecoveryStatus): SuggestionBand | null {
  switch (status) {
    case "normal":
      return "good";
    case "elevated":
      return "moderate";
    case "high":
      return "poor";
    case "insufficient":
      return null;
  }
}

/** Oura readiness score → band, per the user's thresholds. */
export function bandFromReadiness(
  score: number,
  thresholds: SuggestionThresholds,
): SuggestionBand {
  if (score >= thresholds.goodMin) return "good";
  if (score >= thresholds.moderateMin) return "moderate";
  return "poor";
}

const BAND_KIND: Record<SuggestionBand, SuggestionKind> = {
  good: "PLANNED",
  moderate: "LIGHTER",
  poor: "REST",
};

const RECOVERY_REASONS: Record<SuggestionBand, string> = {
  good: "Recovery looks normal.",
  moderate: "Recovery is slightly off baseline — consider going lighter.",
  poor: "Recovery is well off baseline — consider a rest day or a light session.",
};

function readinessReason(score: number, band: SuggestionBand): string {
  switch (band) {
    case "good":
      return `Readiness ${score} — good to go.`;
    case "moderate":
      return `Readiness ${score} — consider going lighter.`;
    case "poor":
      return `Readiness ${score} — consider a rest day or a light session.`;
  }
}

export interface SuggestSessionInput {
  nextEntry: RotationEntry;
  /** Recovery engine status; takes precedence unless "insufficient". */
  recoveryStatus?: RecoveryStatus | null;
  /** Oura readiness score; the fallback signal. */
  readinessScore?: number | null;
  thresholds: SuggestionThresholds;
}

/**
 * Band the day's recovery signal and turn the next rotation entry into an
 * advisory suggestion. Recovery status wins; an insufficient baseline falls back
 * to readiness banding; with neither signal the planned entry is shown as-is
 * with the "no recovery data" reason — never a guess.
 */
export function suggestSession(input: SuggestSessionInput): SessionSuggestion {
  if (input.nextEntry.kind === "REST") {
    return {
      kind: "REST",
      templateId: null,
      reason: "A rest day is next in your rotation.",
    };
  }
  const templateId = input.nextEntry.templateId;

  const recoveryBand =
    input.recoveryStatus != null ? bandFromRecovery(input.recoveryStatus) : null;
  if (recoveryBand != null) {
    return {
      kind: BAND_KIND[recoveryBand],
      templateId,
      reason: RECOVERY_REASONS[recoveryBand],
    };
  }

  if (input.readinessScore != null) {
    const band = bandFromReadiness(input.readinessScore, input.thresholds);
    return {
      kind: BAND_KIND[band],
      templateId,
      reason: readinessReason(input.readinessScore, band),
    };
  }

  return {
    kind: "PLANNED",
    templateId,
    reason: "No recovery data available — showing your planned session as-is.",
  };
}

/**
 * The rotation pointer: the entry after the most recent logged session whose
 * template is in the rotation, wrapping around. Consecutive REST entries are
 * consumed by elapsed calendar days (one per full day beyond the first) so the
 * pointer never sticks on rest slots — [Push, Pull, REST, Legs] with Pull
 * logged Tuesday reads REST on Wednesday, Legs from Thursday on.
 *
 * No history (or a last template no longer in the rotation) → the first entry,
 * even a REST. Empty rotation → null. A templateId appearing twice resolves to
 * its FIRST occurrence.
 */
export function nextRotationEntry(
  rotation: RotationEntry[],
  lastLoggedTemplateId: string | null,
  daysSinceLastLogged: number | null,
): { entry: RotationEntry; index: number } | null {
  const first = rotation[0];
  if (first === undefined) return null;

  const lastIndex =
    lastLoggedTemplateId == null
      ? -1
      : rotation.findIndex(
          (e) => e.kind === "TEMPLATE" && e.templateId === lastLoggedTemplateId,
        );
  if (lastIndex === -1) return { entry: first, index: 0 };

  let index = (lastIndex + 1) % rotation.length;
  // The `?? first` arms can't trigger (index stays < length) — they only carry
  // the non-empty proof past noUncheckedIndexedAccess.
  let entry = rotation[index] ?? first;
  // The day right after a session may legitimately be a REST slot; only days
  // beyond that consume further REST entries. Step-capped so an all-REST tail
  // (or rotation) terminates.
  let budget = Math.max(0, (daysSinceLastLogged ?? 1) - 1);
  let steps = 0;
  while (entry.kind === "REST" && budget > 0 && steps < rotation.length) {
    budget -= 1;
    steps += 1;
    index = (index + 1) % rotation.length;
    entry = rotation[index] ?? first;
  }
  return { entry, index };
}

/** Morning before the cutoff hour (Amsterdam wall clock), evening from it onward. */
export function resolveMode(nowHHmm: string, cutoffHour: number): BriefingMode {
  return Number(nowHHmm.slice(0, 2)) < cutoffHour ? "morning" : "evening";
}

// ---------------------------------------------------------------------------
// Section DTOs — the single source of truth for the composition service, the
// Today card, and the MCP tool. Every section is optional in BriefingSections:
// an absent key means the data (or feature) isn't available, NEVER a zero.
// ---------------------------------------------------------------------------

export interface SleepSection {
  /** Civil day the readings belong to — may lag the briefing day. */
  day: string;
  /** True when `day` is earlier than the briefing day (label it, don't pretend it's fresh). */
  isStale: boolean;
  sleepScore: number | null;
  totalSleepMin: number | null;
  readinessScore: number | null;
  recoveryStatus: RecoveryStatus | null;
  /** The recovery engine's trend-signal caveat, passed through verbatim. */
  caveat: string;
}

export interface TargetsSection {
  /** Today's water target incl. the caffeine adjustment (from the daily_summary view). */
  waterTargetMl: number;
  /** Running caffeine total feeding that target. */
  caffeineMg: number | null;
  proteinTargetG: number | null;
  intakeKcalTarget: number | null;
  /** Empirical TDEE estimate (trend-quality context, never a deficit target). */
  tdeeKcal: number | null;
  tdeeConfidence: Confidence | null;
}

export interface SessionSuggestionView extends SessionSuggestion {
  templateName: string | null;
  templateArchived: boolean;
  rotationIndex: number;
}

export interface SuggestedSessionSection {
  /** null ⇒ no rotation configured — the UI shows the "set up your split" hint. */
  suggestion: SessionSuggestionView | null;
  caveat: string;
}

export interface SupplementsSection {
  timeGroup: SupplementTimeGroup;
  doneCount: number;
  total: number;
}

export interface WeightTrendSection {
  latestKg: number | null;
  avg7dKg: number | null;
  /** Change in the 7-day average across the last week of data. */
  delta7dKg: number | null;
}

export interface ObservationSection {
  title: string;
  /** Correlational finding with its n — a tendency, never a causal claim. */
  finding: string;
  n: number;
}

export interface RecapSection {
  water: { ml: number; targetMl: number };
  protein: { actualG: number; targetG: number | null };
  /** Intake only — never netted against expenditure (CLAUDE.md guardrail). */
  calories: { actualKcal: number; targetKcal: number | null };
  training: { done: boolean; volumeKg: number | null; workingSets: number | null };
}

export interface UnfinishedSection {
  supplementGroups: { timeGroup: SupplementTimeGroup; remaining: number }[];
  waterShortfallMl: number | null;
}

export interface TomorrowSection extends SuggestedSessionSection {
  day: string;
  /** e.g. the pre-workout supplement reminder when tomorrow is a training day. */
  prepLine: string | null;
}

export interface GoalSection {
  phase: GoalPhase;
  goalWeightKg: number;
  trendWeightKg: number | null;
  /** The STORED daily target (kcal) — possibly frozen under low TDEE confidence.
   *  Derived from TDEE + weight trend only, never device calories. */
  targetKcal: number;
  /** Today's re-derived capped rate; null when paused or past the date. */
  plannedRateKgPerWeek: number | null;
  /** Low TDEE confidence: check-ins paused, target frozen. */
  paused: boolean;
  /** An undecided weekly proposal awaits a one-tap decision on /goal. */
  pendingCheckIn: boolean;
}

export interface BriefingSections {
  sleep?: SleepSection;
  targets?: TargetsSection;
  goal?: GoalSection;
  session?: SuggestedSessionSection;
  supplements?: SupplementsSection;
  weightTrend?: WeightTrendSection;
  observation?: ObservationSection;
  recap?: RecapSection;
  unfinished?: UnfinishedSection;
  tomorrow?: TomorrowSection;
}

export interface Briefing {
  day: string;
  mode: BriefingMode;
  generatedAt: string;
  /** Collapsed one-liner; "" when nothing is available. */
  headline: string;
  sections: BriefingSections;
}

/** "Push #2", "Push #2 (lighter)", "Rest day" / "Rest suggested" — or null. */
function sessionPhrase(section: SuggestedSessionSection | undefined): string | null {
  const s = section?.suggestion;
  if (!s) return null;
  if (s.kind === "REST") {
    // templateId null = a planned REST entry; set = rest suggested over a planned session.
    return s.templateId == null ? "Rest day" : "Rest suggested";
  }
  if (s.templateName == null) return null;
  return s.kind === "LIGHTER" ? `${s.templateName} (lighter)` : s.templateName;
}

/** Collapsed morning one-liner, e.g. "Readiness 82 · Push #2 · 2.7 L target". */
export function morningHeadline(sections: BriefingSections): string {
  const parts: string[] = [];
  if (sections.sleep?.readinessScore != null) {
    parts.push(`Readiness ${Math.round(sections.sleep.readinessScore)}`);
  } else if (sections.sleep?.sleepScore != null) {
    parts.push(`Sleep ${Math.round(sections.sleep.sleepScore)}`);
  }
  const session = sessionPhrase(sections.session);
  if (session != null) parts.push(session);
  if (sections.targets != null) {
    parts.push(`${formatLiters(sections.targets.waterTargetMl)} target`);
  }
  return parts.join(" · ");
}

/** Collapsed evening one-liner, e.g. "Water 2.1/2.7 L · Protein 130/160 g · Trained ✓ · Tomorrow: Legs". */
export function eveningHeadline(sections: BriefingSections): string {
  const parts: string[] = [];
  if (sections.recap != null) {
    const { water, protein, training } = sections.recap;
    parts.push(`Water ${(water.ml / 1000).toFixed(1)}/${formatLiters(water.targetMl)}`);
    if (protein.targetG != null) {
      parts.push(`Protein ${Math.round(protein.actualG)}/${Math.round(protein.targetG)} g`);
    } else {
      parts.push(`Protein ${Math.round(protein.actualG)} g`);
    }
    parts.push(training.done ? "Trained ✓" : "No session");
  }
  const tomorrow = sessionPhrase(sections.tomorrow);
  if (tomorrow != null) parts.push(`Tomorrow: ${tomorrow}`);
  return parts.join(" · ");
}
