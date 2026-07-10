// Goal-based calorie targets: orchestration over the pure engine in lib/goals
// (which owns ALL the target math). Targets derive from the empirical TDEE and
// the measured weight trend ONLY — never wearable/device calories, and intake is
// never netted against expenditure (CLAUDE.md). Movement affects the target only
// implicitly, through the weight trend. Low TDEE confidence PAUSES derivations
// (the stored target keeps displaying frozen) — a target is never fabricated.

import type {
  EntryOrigin,
  Goal,
  GoalCheckIn,
  GoalStatus,
  CheckInStatus,
} from "@/generated/prisma/client";
import {
  civilDay,
  daysBetween,
  dayToDbDate,
  shiftDay,
  todayLocal,
} from "@/lib/dates";
import {
  capRate,
  computeTarget,
  dueCheckInDay,
  earliestRealisticDate,
  GOAL_REACHED_TOLERANCE_KG,
  inferPhase,
  MAX_DEFICIT_PCT,
  MAX_SURPLUS_PCT,
  proteinGPerKg,
  requiredRateKgPerWeek,
  weeklyProposal,
  weeksRemaining,
  type BindingBound,
  type GoalPhase,
  type RateCaps,
  type TargetBounds,
} from "@/lib/goals";
import type { CreateGoalInput } from "@/lib/schemas/goals";
import type { GoalSettings } from "@/lib/schemas/settings";
import {
  weightTrendKgPerWeek,
  type Confidence,
  type WeightPoint,
} from "@/lib/tdee";
import { prisma } from "@/server/db";
import { DomainError, NotFoundError } from "./errors";
import { getGoalSettings } from "./settings";
import { getTdeeEstimate } from "./tdee";

// The trend window for "current trend weight" and progress — matches the
// weight-goal insight's 30 days: denoised but responsive.
const GOAL_TREND_WINDOW_DAYS = 30;

/** A goal needs at least one check-in week ahead of it. */
const MIN_GOAL_HORIZON_DAYS = 7;

// Only the columns this feature may read from daily_summary. Deliberately
// EXCLUDES active_kcal / steps so wearable expenditure can never enter this
// code path (the RawTdeeRow idiom from services/tdee.ts).
interface RawWeightRow {
  day: unknown;
  weightKg: unknown;
  weight7dAvg: unknown;
}

function num(v: unknown): number | null {
  return v == null ? null : Number(v);
}

/** daily_summary weight series for [start, end]: prefer the denoised 7-day
 *  average, fall back to the raw daily weight (the weight-goal/tdee pattern —
 *  that service stays untouched, so the small query duplication is deliberate). */
async function weightSeries(start: string, end: string): Promise<WeightPoint[]> {
  const rows = await prisma.$queryRaw<RawWeightRow[]>`
    SELECT day::text AS "day", weight_kg AS "weightKg", weight_7d_avg AS "weight7dAvg"
    FROM daily_summary
    WHERE day BETWEEN ${start}::date AND ${end}::date
    ORDER BY day
  `;
  const points: WeightPoint[] = [];
  for (const r of rows) {
    const w = num(r.weight7dAvg) ?? num(r.weightKg);
    if (w != null) points.push({ day: String(r.day), weightKg: w });
  }
  return points;
}

/** Current trend weight = the most recent point of a 30-day series, or null
 *  with no weigh-ins at all. */
function latestTrendWeight(series: WeightPoint[]): number | null {
  return series[series.length - 1]?.weightKg ?? null;
}

function capsOf(s: GoalSettings): RateCaps {
  return {
    maxLossPctBwPerWeek: s.maxLossPctBwPerWeek,
    maxGainPctBwPerWeek: s.maxGainPctBwPerWeek,
  };
}

function boundsOf(s: GoalSettings): TargetBounds {
  return {
    floorKcal: s.floorKcal,
    maxDeficitPct: MAX_DEFICIT_PCT,
    maxSurplusPct: MAX_SURPLUS_PCT,
  };
}

/** Round a maintenance suggestion the way targets are presented. */
function round10(kcal: number): number {
  return Math.round(kcal / 10) * 10;
}

const PAUSED_REASON =
  "Needs more consistent logging — check-ins resume when the TDEE estimate is reliable again.";

export interface GoalDTO {
  id: string;
  goalWeightKg: number;
  targetDate: string;
  startDate: string;
  startTrendWeightKg: number;
  phase: GoalPhase;
  currentTargetKcal: number;
  status: GoalStatus;
  createdAt: string;
}

function toGoalDTO(g: Goal): GoalDTO {
  return {
    id: g.id,
    goalWeightKg: Number(g.goalWeightKg),
    targetDate: civilDay(g.targetDate),
    startDate: civilDay(g.startDate),
    startTrendWeightKg: Number(g.startTrendWeightKg),
    phase: g.phase,
    currentTargetKcal: g.currentTargetKcal,
    status: g.status,
    createdAt: g.createdAt.toISOString(),
  };
}

export interface CheckInDTO {
  id: string;
  day: string;
  plannedRateKgWk: number;
  actualRateKgWk: number | null;
  previousTargetKcal: number;
  proposedTargetKcal: number;
  status: CheckInStatus;
  note: string | null;
  decidedAt: string | null;
  decidedVia: EntryOrigin | null;
}

function toCheckInDTO(c: GoalCheckIn): CheckInDTO {
  return {
    id: c.id,
    day: civilDay(c.day),
    plannedRateKgWk: Number(c.plannedRateKgWk),
    actualRateKgWk: c.actualRateKgWk == null ? null : Number(c.actualRateKgWk),
    previousTargetKcal: c.previousTargetKcal,
    proposedTargetKcal: c.proposedTargetKcal,
    status: c.status,
    note: c.note,
    decidedAt: c.decidedAt ? c.decidedAt.toISOString() : null,
    decidedVia: c.decidedVia,
  };
}

/** The derived plan for a (goalWeightKg, targetDate) pair — what the create
 *  form previews and createGoal persists from. */
export interface GoalPlan {
  phase: GoalPhase;
  trendWeightKg: number;
  goalWeightKg: number;
  targetDate: string;
  weeksRemaining: number;
  /** What the calendar demands (kg/wk, positive = gaining), pre-cap. */
  requiredRateKgPerWeek: number;
  /** The rate actually planned (post safety caps). */
  plannedRateKgPerWeek: number;
  rateCapped: boolean;
  /** Set iff the rate was capped: the earliest honest completion day. */
  earliestRealisticDate: string | null;
  targetKcal: number;
  bound: BindingBound;
  tdeeKcal: number;
  tdeeConfidence: Confidence;
  proteinGPerKg: number;
}

/**
 * Pure plan computation for the create form — persists NOTHING (the
 * vision-draft convention: previewing and committing are separate calls).
 * Gates: TDEE confidence must be medium/high, a weigh-in must exist, and the
 * date must leave at least one check-in week of runway.
 */
export async function previewGoal(input: CreateGoalInput): Promise<GoalPlan> {
  const today = todayLocal();
  if (daysBetween(today, input.targetDate) < MIN_GOAL_HORIZON_DAYS) {
    throw new DomainError(
      `Target date must be at least ${MIN_GOAL_HORIZON_DAYS} days out`,
    );
  }

  const [tdee, settings, series] = await Promise.all([
    getTdeeEstimate(),
    getGoalSettings(),
    weightSeries(shiftDay(today, -(GOAL_TREND_WINDOW_DAYS - 1)), today),
  ]);
  if (tdee.tdee == null || tdee.confidence === "low") {
    throw new DomainError(
      "TDEE confidence is low — a goal target needs more consistent logging first",
    );
  }
  const trendWeightKg = latestTrendWeight(series);
  if (trendWeightKg == null) {
    throw new DomainError("No weight data — log or sync a weigh-in first");
  }

  const caps = capsOf(settings);
  const phase = inferPhase(trendWeightKg, input.goalWeightKg);
  const weeks = weeksRemaining(today, input.targetDate);
  const required = requiredRateKgPerWeek({
    trendWeightKg,
    goalWeightKg: input.goalWeightKg,
    weeksRemaining: weeks,
  });
  const { rateKgPerWeek: planned, capped } = capRate(
    required,
    trendWeightKg,
    caps,
  );
  const { targetKcal, bound } = computeTarget(
    tdee.tdee,
    planned,
    boundsOf(settings),
  );

  return {
    phase,
    trendWeightKg,
    goalWeightKg: input.goalWeightKg,
    targetDate: input.targetDate,
    weeksRemaining: weeks,
    requiredRateKgPerWeek: required,
    plannedRateKgPerWeek: planned,
    rateCapped: capped,
    earliestRealisticDate: capped
      ? earliestRealisticDate({
          trendWeightKg,
          goalWeightKg: input.goalWeightKg,
          startDay: today,
          caps,
        })
      : null,
    targetKcal,
    bound,
    tdeeKcal: tdee.tdee,
    tdeeConfidence: tdee.confidence,
    proteinGPerKg: proteinGPerKg(phase, settings.proteinGPerKg),
  };
}

/**
 * Create the (single) ACTIVE goal from a previewed plan. The service check is
 * the friendly error; the partial unique index goals_one_active_idx is the
 * race backstop. Returns the plan too so the UI can show any clamp warning.
 */
export async function createGoal(
  input: CreateGoalInput,
): Promise<{ goal: GoalDTO; plan: GoalPlan }> {
  const active = await prisma.goal.findFirst({ where: { status: "ACTIVE" } });
  if (active) {
    throw new DomainError(
      "A goal is already active — complete or abandon it first",
    );
  }
  const plan = await previewGoal(input);
  const today = todayLocal();
  const goal = await prisma.goal.create({
    data: {
      goalWeightKg: input.goalWeightKg,
      targetDate: dayToDbDate(input.targetDate),
      startDate: dayToDbDate(today),
      startTrendWeightKg: plan.trendWeightKg,
      phase: plan.phase,
      currentTargetKcal: plan.targetKcal,
    },
  });
  return { goal: toGoalDTO(goal), plan };
}

/** The ACTIVE goal as the Goal screen sees it. */
export interface ActiveGoalView extends GoalDTO {
  trendWeightKg: number | null;
  /** 30-day measured trend, kg/wk (lib/tdee convention: positive = gaining). */
  slopeKgPerWeek: number;
  /** trend − goal, signed kg; null with no weight data. */
  remainingKg: number | null;
  /** Share of the start→goal distance covered, 0–100; null when unknowable. */
  progressPct: number | null;
  /** Today's re-derived capped required rate; null when paused/past the date. */
  plannedRateKgPerWeek: number | null;
  earliestRealisticDate: string | null;
  /** The phase protein factor in force (g/kg). */
  proteinGPerKg: number;
  /** True when TDEE confidence is low — check-ins paused, target frozen. */
  paused: boolean;
  pausedReason: string | null;
  tdeeKcal: number | null;
  tdeeConfidence: Confidence;
  nextCheckInDay: string | null;
  completion: {
    trendReached: boolean;
    datePassed: boolean;
    /** MAINTAIN suggestion ≈ TDEE (round 10); null on low confidence — never fabricated. */
    suggestedMaintainKcal: number | null;
  };
}

export interface GoalStatusResult {
  goal: ActiveGoalView | null;
  /** Most recent finished goal — the empty-state screen shows it. */
  lastGoal: GoalDTO | null;
  /** Check-in history (for the active goal, else the last one), newest first. */
  checkIns: CheckInDTO[];
}

/** The next check-in day: today when one is due but not yet recorded, else the
 *  next whole-week mark — and null once that falls past the target date. */
function nextCheckInDayFor(
  startDate: string,
  today: string,
  targetDate: string,
  checkIns: CheckInDTO[],
): string | null {
  const due = dueCheckInDay(startDate, today);
  if (due != null && due <= targetDate && !checkIns.some((c) => c.day === due)) {
    return due;
  }
  const elapsed = daysBetween(startDate, today);
  const next = shiftDay(startDate, (Math.floor(elapsed / 7) + 1) * 7);
  return next <= targetDate ? next : null;
}

/**
 * Everything the Goal screen needs in one call. The stored currentTargetKcal
 * always displays (frozen under low confidence); `paused` only gates the FRESH
 * derivations (planned rate, maintenance suggestion).
 */
export async function getGoalStatus(): Promise<GoalStatusResult> {
  const today = todayLocal();
  const active = await prisma.goal.findFirst({ where: { status: "ACTIVE" } });

  if (!active) {
    const last = await prisma.goal.findFirst({
      where: { status: { not: "ACTIVE" } },
      orderBy: { updatedAt: "desc" },
    });
    const checkIns = last
      ? await prisma.goalCheckIn.findMany({
          where: { goalId: last.id },
          orderBy: { day: "desc" },
        })
      : [];
    return {
      goal: null,
      lastGoal: last ? toGoalDTO(last) : null,
      checkIns: checkIns.map(toCheckInDTO),
    };
  }

  const [tdee, settings, series, checkInRows] = await Promise.all([
    getTdeeEstimate(),
    getGoalSettings(),
    weightSeries(shiftDay(today, -(GOAL_TREND_WINDOW_DAYS - 1)), today),
    prisma.goalCheckIn.findMany({
      where: { goalId: active.id },
      orderBy: { day: "desc" },
    }),
  ]);
  const dto = toGoalDTO(active);
  const checkIns = checkInRows.map(toCheckInDTO);

  const trendWeightKg = latestTrendWeight(series);
  const slopeKgPerWeek = weightTrendKgPerWeek(series);
  const paused = tdee.tdee == null || tdee.confidence === "low";

  const remainingKg =
    trendWeightKg == null ? null : trendWeightKg - dto.goalWeightKg;
  const totalDeltaKg = dto.goalWeightKg - dto.startTrendWeightKg;
  const progressPct =
    trendWeightKg == null || totalDeltaKg === 0
      ? null
      : Math.round(
          Math.min(
            1,
            Math.max(0, (trendWeightKg - dto.startTrendWeightKg) / totalDeltaKg),
          ) * 100,
        );

  const datePassed = today > dto.targetDate;
  const trendReached =
    trendWeightKg != null &&
    Math.abs(trendWeightKg - dto.goalWeightKg) <= GOAL_REACHED_TOLERANCE_KG;

  let plannedRateKgPerWeek: number | null = null;
  let earliest: string | null = null;
  if (!paused && !datePassed && trendWeightKg != null) {
    const weeks = weeksRemaining(today, dto.targetDate);
    if (weeks > 0) {
      const required = requiredRateKgPerWeek({
        trendWeightKg,
        goalWeightKg: dto.goalWeightKg,
        weeksRemaining: weeks,
      });
      const capped = capRate(required, trendWeightKg, capsOf(settings));
      plannedRateKgPerWeek = capped.rateKgPerWeek;
      earliest = capped.capped
        ? earliestRealisticDate({
            trendWeightKg,
            goalWeightKg: dto.goalWeightKg,
            startDay: today,
            caps: capsOf(settings),
          })
        : null;
    }
  }

  return {
    goal: {
      ...dto,
      trendWeightKg,
      slopeKgPerWeek,
      remainingKg,
      progressPct,
      plannedRateKgPerWeek,
      earliestRealisticDate: earliest,
      proteinGPerKg: proteinGPerKg(dto.phase, settings.proteinGPerKg),
      paused,
      pausedReason: paused ? PAUSED_REASON : null,
      tdeeKcal: tdee.tdee,
      tdeeConfidence: tdee.confidence,
      nextCheckInDay: nextCheckInDayFor(
        dto.startDate,
        today,
        dto.targetDate,
        checkIns,
      ),
      completion: {
        trendReached,
        datePassed,
        suggestedMaintainKcal:
          !paused && tdee.tdee != null ? round10(tdee.tdee) : null,
      },
    },
    lastGoal: null,
    checkIns,
  };
}

/**
 * The ACTIVE goal's targets for adherence: the STORED kcal target (frozen —
 * deliberately no TDEE call, so it keeps working under low confidence) and the
 * phase protein factor. Null when no goal is active (adherence then falls back
 * to the manual settings).
 */
export async function getActiveGoalTargets(): Promise<{
  targetKcal: number;
  proteinGPerKg: number;
  phase: GoalPhase;
} | null> {
  const active = await prisma.goal.findFirst({
    where: { status: "ACTIVE" },
    select: { currentTargetKcal: true, phase: true },
  });
  if (!active) return null;
  const settings = await getGoalSettings();
  return {
    targetKcal: active.currentTargetKcal,
    proteinGPerKg: proteinGPerKg(active.phase, settings.proteinGPerKg),
    phase: active.phase,
  };
}

export type CheckInSkipReason =
  | "no-active-goal"
  | "not-due"
  | "already-done"
  | "low-confidence"
  | "past-target-date";

export interface CheckInRunResult {
  ran: boolean;
  reason?: CheckInSkipReason;
  checkIn?: CheckInDTO;
  /** True when a fresh PROPOSED row was created — the caller's push signal. */
  proposed: boolean;
}

/**
 * The weekly check-in for `today` (scheduler-called daily; the due-day math
 * plus the unique (goalId, day) row make it fire exactly once per goal week,
 * with catch-up after downtime). Compares the week's measured trend rate to
 * the planned rate and persists a capped proposal — PROPOSED by default,
 * applied silently when autoApplyCheckIns is on. Low TDEE confidence pauses:
 * no row, no push, nothing fabricated.
 */
export async function runWeeklyCheckIn(
  today: string = todayLocal(),
): Promise<CheckInRunResult> {
  const active = await prisma.goal.findFirst({ where: { status: "ACTIVE" } });
  if (!active) return { ran: false, reason: "no-active-goal", proposed: false };
  const dto = toGoalDTO(active);

  const dueDay = dueCheckInDay(dto.startDate, today);
  if (dueDay == null) return { ran: false, reason: "not-due", proposed: false };
  if (dueDay > dto.targetDate) {
    // The date has run out — the completion notice takes over from here.
    return { ran: false, reason: "past-target-date", proposed: false };
  }
  const existing = await prisma.goalCheckIn.findUnique({
    where: { goalId_day: { goalId: active.id, day: dayToDbDate(dueDay) } },
  });
  if (existing) return { ran: false, reason: "already-done", proposed: false };

  const [tdee, settings] = await Promise.all([
    getTdeeEstimate(),
    getGoalSettings(),
  ]);
  if (tdee.tdee == null || tdee.confidence === "low") {
    return { ran: false, reason: "low-confidence", proposed: false };
  }

  // The week under review. Planned rate = the capped required rate as of the
  // week's START (deterministic, self-correcting toward the target date);
  // actual rate = the regression over the week's denoised weights.
  const weekStart = shiftDay(dueDay, -7);
  const series = await weightSeries(weekStart, dueDay);
  // Fall back to the goal's start weight when the week has no weigh-ins at all.
  const weekStartTrendKg = series[0]?.weightKg ?? dto.startTrendWeightKg;
  const planned = capRate(
    requiredRateKgPerWeek({
      trendWeightKg: weekStartTrendKg,
      goalWeightKg: dto.goalWeightKg,
      weeksRemaining: weeksRemaining(weekStart, dto.targetDate),
    }),
    weekStartTrendKg,
    capsOf(settings),
  ).rateKgPerWeek;

  const base = {
    goalId: active.id,
    day: dayToDbDate(dueDay),
    plannedRateKgWk: planned,
    previousTargetKcal: active.currentTargetKcal,
  };

  const distinctDays = new Set(series.map((p) => p.day)).size;
  if (distinctDays < 2) {
    // Too little data to measure the week — record the gap, change nothing,
    // stay silent. decidedAt marks it as needing no user action.
    const row = await prisma.goalCheckIn.create({
      data: {
        ...base,
        actualRateKgWk: null,
        proposedTargetKcal: active.currentTargetKcal,
        status: "DISMISSED",
        note: "Not enough weigh-ins this week to measure the trend — no change.",
        decidedAt: new Date(),
      },
    });
    return { ran: true, checkIn: toCheckInDTO(row), proposed: false };
  }

  const actual = weightTrendKgPerWeek(series);
  const proposal = weeklyProposal({
    plannedRateKgPerWeek: planned,
    actualRateKgPerWeek: actual,
    currentTargetKcal: active.currentTargetKcal,
    tdeeKcal: tdee.tdee,
    adjustmentCapKcal: settings.adjustmentCapKcal,
    bounds: boundsOf(settings),
  });
  const data = {
    ...base,
    actualRateKgWk: actual,
    proposedTargetKcal: proposal.proposedTargetKcal,
    note: proposal.reason,
  };

  if (proposal.adjustmentKcal === 0) {
    // On plan (or bound-held): nothing to apply or decide — silent history row.
    const row = await prisma.goalCheckIn.create({
      data: { ...data, status: "AUTO_APPLIED", decidedAt: new Date() },
    });
    return { ran: true, checkIn: toCheckInDTO(row), proposed: false };
  }

  if (settings.autoApplyCheckIns) {
    const [row] = await prisma.$transaction([
      prisma.goalCheckIn.create({
        data: { ...data, status: "AUTO_APPLIED", decidedAt: new Date() },
      }),
      prisma.goal.update({
        where: { id: active.id },
        data: { currentTargetKcal: proposal.proposedTargetKcal },
      }),
    ]);
    return { ran: true, checkIn: toCheckInDTO(row), proposed: false };
  }

  const row = await prisma.goalCheckIn.create({
    data: { ...data, status: "PROPOSED" },
  });
  return { ran: true, checkIn: toCheckInDTO(row), proposed: true };
}

/**
 * One-tap decision on a PROPOSED check-in. Accepting moves the goal's stored
 * target to the proposal (one transaction); dismissing only stamps the row.
 * `origin` records who decided (PWA | MCP).
 */
export async function decideCheckIn(
  id: string,
  decision: "accept" | "dismiss",
  origin: EntryOrigin,
): Promise<CheckInDTO> {
  const checkIn = await prisma.goalCheckIn.findUnique({
    where: { id },
    include: { goal: true },
  });
  if (!checkIn) throw new NotFoundError("Check-in", id);
  if (checkIn.status !== "PROPOSED") {
    throw new DomainError("Check-in has already been decided");
  }
  if (checkIn.goal.status !== "ACTIVE") {
    throw new DomainError("The goal is no longer active");
  }

  const stamp = { decidedAt: new Date(), decidedVia: origin };
  if (decision === "accept") {
    const [row] = await prisma.$transaction([
      prisma.goalCheckIn.update({
        where: { id },
        data: { status: "ACCEPTED", ...stamp },
      }),
      prisma.goal.update({
        where: { id: checkIn.goalId },
        data: { currentTargetKcal: checkIn.proposedTargetKcal },
      }),
    ]);
    return toCheckInDTO(row);
  }
  const row = await prisma.goalCheckIn.update({
    where: { id },
    data: { status: "DISMISSED", ...stamp },
  });
  return toCheckInDTO(row);
}

/** Explicit, user-initiated status transitions — the ONLY ones (reaching the
 *  goal or passing the date merely surfaces a suggestion, never auto-switches). */
async function endGoal(id: string, status: GoalStatus): Promise<GoalDTO> {
  const goal = await prisma.goal.findUnique({ where: { id } });
  if (!goal) throw new NotFoundError("Goal", id);
  if (goal.status !== "ACTIVE") throw new DomainError("Goal is not active");
  return toGoalDTO(
    await prisma.goal.update({ where: { id }, data: { status } }),
  );
}

export async function completeGoal(id: string): Promise<GoalDTO> {
  return endGoal(id, "COMPLETED");
}

export async function abandonGoal(id: string): Promise<GoalDTO> {
  return endGoal(id, "ABANDONED");
}

export interface CompletionNotice {
  goalId: string;
  goalWeightKg: number;
  trendReached: boolean;
  datePassed: boolean;
  /** ≈ TDEE (round 10) for the MAINTAIN suggestion; null on low confidence. */
  suggestedMaintainKcal: number | null;
}

/**
 * The ACTIVE goal's completion event, when un-notified: trend reached the goal
 * (±0.1 kg) or the target date passed. Null otherwise. The daily job pushes it
 * once — markCompletionNotified records after a confirmed send.
 */
export async function pendingCompletionNotice(): Promise<CompletionNotice | null> {
  const active = await prisma.goal.findFirst({
    where: { status: "ACTIVE", completionNotifiedAt: null },
  });
  if (!active) return null;
  const dto = toGoalDTO(active);
  const today = todayLocal();

  const series = await weightSeries(
    shiftDay(today, -(GOAL_TREND_WINDOW_DAYS - 1)),
    today,
  );
  const trendWeightKg = latestTrendWeight(series);
  const trendReached =
    trendWeightKg != null &&
    Math.abs(trendWeightKg - dto.goalWeightKg) <= GOAL_REACHED_TOLERANCE_KG;
  const datePassed = today > dto.targetDate;
  if (!trendReached && !datePassed) return null;

  const tdee = await getTdeeEstimate();
  return {
    goalId: active.id,
    goalWeightKg: dto.goalWeightKg,
    trendReached,
    datePassed,
    suggestedMaintainKcal:
      tdee.tdee != null && tdee.confidence !== "low"
        ? round10(tdee.tdee)
        : null,
  };
}

/** Record-after-sent: only called once the completion push reached a device. */
export async function markCompletionNotified(goalId: string): Promise<void> {
  await prisma.goal.update({
    where: { id: goalId },
    data: { completionNotifiedAt: new Date() },
  });
}
