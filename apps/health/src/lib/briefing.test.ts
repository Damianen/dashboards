import { describe, expect, it } from "vitest";

import {
  bandFromReadiness,
  bandFromRecovery,
  eveningHeadline,
  morningHeadline,
  nextRotationEntry,
  resolveMode,
  suggestSession,
  type BriefingSections,
  type SessionSuggestionView,
  type SleepSection,
} from "./briefing";
import type { RotationEntry, SuggestionThresholds } from "./schemas/briefing";

const THRESHOLDS: SuggestionThresholds = { goodMin: 75, moderateMin: 60 };

const T = (templateId: string): RotationEntry => ({ kind: "TEMPLATE", templateId });
const REST: RotationEntry = { kind: "REST" };

describe("bandFromRecovery", () => {
  it("maps the engine statuses onto bands", () => {
    expect(bandFromRecovery("normal")).toBe("good");
    expect(bandFromRecovery("elevated")).toBe("moderate");
    expect(bandFromRecovery("high")).toBe("poor");
  });

  it("returns null for an insufficient baseline (caller falls back to readiness)", () => {
    expect(bandFromRecovery("insufficient")).toBeNull();
  });
});

describe("bandFromReadiness", () => {
  it("bands per the default thresholds (>=75 good, 60–74 moderate, <60 poor)", () => {
    expect(bandFromReadiness(75, THRESHOLDS)).toBe("good");
    expect(bandFromReadiness(74, THRESHOLDS)).toBe("moderate");
    expect(bandFromReadiness(60, THRESHOLDS)).toBe("moderate");
    expect(bandFromReadiness(59, THRESHOLDS)).toBe("poor");
  });

  it("respects custom thresholds", () => {
    const custom: SuggestionThresholds = { goodMin: 80, moderateMin: 50 };
    expect(bandFromReadiness(79, custom)).toBe("moderate");
    expect(bandFromReadiness(49, custom)).toBe("poor");
  });
});

describe("suggestSession", () => {
  it("keeps a planned REST entry as REST in every band", () => {
    for (const recoveryStatus of ["normal", "elevated", "high"] as const) {
      const s = suggestSession({
        nextEntry: REST,
        recoveryStatus,
        readinessScore: 90,
        thresholds: THRESHOLDS,
      });
      expect(s.kind).toBe("REST");
      expect(s.templateId).toBeNull();
      expect(s.reason).toContain("rotation");
    }
  });

  it("lets the recovery status win over a contradicting readiness score", () => {
    const s = suggestSession({
      nextEntry: T("push"),
      recoveryStatus: "high",
      readinessScore: 95,
      thresholds: THRESHOLDS,
    });
    expect(s.kind).toBe("REST");
    // The planned template is retained as the "light alternative" the user may still start.
    expect(s.templateId).toBe("push");
  });

  it("falls back to readiness banding when the recovery baseline is insufficient", () => {
    const s = suggestSession({
      nextEntry: T("push"),
      recoveryStatus: "insufficient",
      readinessScore: 82,
      thresholds: THRESHOLDS,
    });
    expect(s.kind).toBe("PLANNED");
    expect(s.reason).toContain("82");
  });

  it("shows the planned session as-is when no signal exists — never guesses", () => {
    const s = suggestSession({ nextEntry: T("push"), thresholds: THRESHOLDS });
    expect(s.kind).toBe("PLANNED");
    expect(s.templateId).toBe("push");
    expect(s.reason).toContain("No recovery data");
  });

  it("good → PLANNED, moderate → LIGHTER (same template), poor → REST", () => {
    expect(
      suggestSession({ nextEntry: T("a"), recoveryStatus: "normal", thresholds: THRESHOLDS }),
    ).toMatchObject({ kind: "PLANNED", templateId: "a" });

    const lighter = suggestSession({
      nextEntry: T("a"),
      recoveryStatus: "elevated",
      thresholds: THRESHOLDS,
    });
    expect(lighter).toMatchObject({ kind: "LIGHTER", templateId: "a" });
    expect(lighter.reason.toLowerCase()).toContain("lighter");

    const rest = suggestSession({
      nextEntry: T("a"),
      readinessScore: 50,
      thresholds: THRESHOLDS,
    });
    expect(rest).toMatchObject({ kind: "REST", templateId: "a" });
    expect(rest.reason).toContain("50");
  });

  it("always carries a non-empty reason", () => {
    for (const input of [
      { nextEntry: REST, thresholds: THRESHOLDS },
      { nextEntry: T("a"), recoveryStatus: "normal" as const, thresholds: THRESHOLDS },
      { nextEntry: T("a"), readinessScore: 65, thresholds: THRESHOLDS },
      { nextEntry: T("a"), thresholds: THRESHOLDS },
    ]) {
      expect(suggestSession(input).reason.length).toBeGreaterThan(0);
    }
  });
});

describe("nextRotationEntry", () => {
  const PPLR = [T("push"), T("pull"), REST, T("legs")];

  it("returns null for an empty rotation (not configured)", () => {
    expect(nextRotationEntry([], null, null)).toBeNull();
  });

  it("returns the first entry when there is no history — even a REST", () => {
    expect(nextRotationEntry(PPLR, null, null)).toEqual({ entry: T("push"), index: 0 });
    expect(nextRotationEntry([REST, T("a")], null, null)).toEqual({ entry: REST, index: 0 });
  });

  it("returns the first entry when the last-logged template is no longer in the rotation", () => {
    expect(nextRotationEntry(PPLR, "deleted-template", 1)).toEqual({
      entry: T("push"),
      index: 0,
    });
  });

  it("advances to the entry after the last-logged template", () => {
    expect(nextRotationEntry(PPLR, "push", 1)).toEqual({ entry: T("pull"), index: 1 });
  });

  it("wraps around after the final entry", () => {
    expect(nextRotationEntry(PPLR, "legs", 1)).toEqual({ entry: T("push"), index: 0 });
  });

  it("consumes REST slots by elapsed days: Pull Tue → Wed REST, Thu Legs, Fri still Legs", () => {
    expect(nextRotationEntry(PPLR, "pull", 1)).toEqual({ entry: REST, index: 2 });
    expect(nextRotationEntry(PPLR, "pull", 2)).toEqual({ entry: T("legs"), index: 3 });
    expect(nextRotationEntry(PPLR, "pull", 3)).toEqual({ entry: T("legs"), index: 3 });
  });

  it("consumes consecutive REST slots one per extra day", () => {
    const rotation = [T("push"), REST, REST, T("pull")];
    expect(nextRotationEntry(rotation, "push", 1)).toEqual({ entry: REST, index: 1 });
    expect(nextRotationEntry(rotation, "push", 2)).toEqual({ entry: REST, index: 2 });
    expect(nextRotationEntry(rotation, "push", 3)).toEqual({ entry: T("pull"), index: 3 });
    expect(nextRotationEntry(rotation, "push", 4)).toEqual({ entry: T("pull"), index: 3 });
  });

  it("does not skip the day-after REST when trained today (daysSince 0)", () => {
    expect(nextRotationEntry(PPLR, "pull", 0)).toEqual({ entry: REST, index: 2 });
  });

  it("treats a null daysSince as the plain next entry", () => {
    expect(nextRotationEntry(PPLR, "pull", null)).toEqual({ entry: REST, index: 2 });
  });

  it("wraps across REST while skipping", () => {
    // Entry after "a" is REST; one extra elapsed day consumes it and wraps back to "a".
    expect(nextRotationEntry([T("a"), REST], "a", 2)).toEqual({ entry: T("a"), index: 0 });
  });

  it("terminates on an all-REST tail with a huge day gap", () => {
    const rotation = [T("a"), REST, REST, REST];
    expect(nextRotationEntry(rotation, "a", 100)).toEqual({ entry: T("a"), index: 0 });
  });

  it("resolves a duplicated template to its first occurrence", () => {
    const rotation = [T("a"), T("b"), T("a"), T("c")];
    expect(nextRotationEntry(rotation, "a", 1)).toEqual({ entry: T("b"), index: 1 });
  });
});

describe("resolveMode", () => {
  it("is morning strictly before the cutoff hour", () => {
    expect(resolveMode("14:59", 15)).toBe("morning");
    expect(resolveMode("15:00", 15)).toBe("evening");
  });

  it("cutoff 0 means always evening", () => {
    expect(resolveMode("00:00", 0)).toBe("evening");
    expect(resolveMode("09:30", 0)).toBe("evening");
  });

  it("cutoff 23 flips only in the final hour", () => {
    expect(resolveMode("22:59", 23)).toBe("morning");
    expect(resolveMode("23:00", 23)).toBe("evening");
  });
});

// --- headline fixtures -------------------------------------------------------

function sleepSection(overrides: Partial<SleepSection> = {}): SleepSection {
  return {
    day: "2026-07-03",
    isStale: false,
    sleepScore: null,
    totalSleepMin: null,
    readinessScore: null,
    recoveryStatus: null,
    caveat: "trend signal",
    ...overrides,
  };
}

function suggestionView(
  overrides: Partial<SessionSuggestionView> = {},
): SessionSuggestionView {
  return {
    kind: "PLANNED",
    templateId: "t1",
    reason: "Recovery looks normal.",
    templateName: "Push #2",
    templateArchived: false,
    rotationIndex: 1,
    ...overrides,
  };
}

describe("morningHeadline", () => {
  it("joins readiness, session, and water target", () => {
    const sections: BriefingSections = {
      sleep: sleepSection({ readinessScore: 82 }),
      session: { suggestion: suggestionView(), caveat: "c" },
      targets: {
        waterTargetMl: 2700,
        caffeineMg: null,
        proteinTargetG: null,
        intakeKcalTarget: null,
        tdeeKcal: null,
        tdeeConfidence: null,
      },
    };
    expect(morningHeadline(sections)).toBe("Readiness 82 · Push #2 · 2.7 L target");
  });

  it("marks a LIGHTER suggestion", () => {
    const sections: BriefingSections = {
      session: { suggestion: suggestionView({ kind: "LIGHTER" }), caveat: "c" },
    };
    expect(morningHeadline(sections)).toBe("Push #2 (lighter)");
  });

  it("distinguishes a planned rest day from rest suggested over a session", () => {
    expect(
      morningHeadline({
        session: {
          suggestion: suggestionView({ kind: "REST", templateId: null, templateName: null }),
          caveat: "c",
        },
      }),
    ).toBe("Rest day");
    expect(
      morningHeadline({
        session: { suggestion: suggestionView({ kind: "REST" }), caveat: "c" },
      }),
    ).toBe("Rest suggested");
  });

  it("falls back to the sleep score when readiness is missing", () => {
    expect(morningHeadline({ sleep: sleepSection({ sleepScore: 78 }) })).toBe("Sleep 78");
  });

  it("tolerates a manual-only sleep day: duration set, both scores null", () => {
    // A manual entry (Oura-outage fallback) yields a sleep section with only
    // totalSleepMin. The headline has no score to lead with and skips the
    // sleep part — the section itself still renders the duration in the card.
    const sections: BriefingSections = {
      sleep: sleepSection({ totalSleepMin: 450 }),
      targets: {
        waterTargetMl: 2700,
        caffeineMg: null,
        proteinTargetG: null,
        intakeKcalTarget: null,
        tdeeKcal: null,
        tdeeConfidence: null,
      },
    };
    expect(morningHeadline(sections)).toBe("2.7 L target");
  });

  it("skips the session part when no rotation is configured", () => {
    expect(
      morningHeadline({
        sleep: sleepSection({ readinessScore: 82 }),
        session: { suggestion: null, caveat: "c" },
      }),
    ).toBe("Readiness 82");
  });

  it("returns an empty string when nothing is available", () => {
    expect(morningHeadline({})).toBe("");
  });
});

describe("eveningHeadline", () => {
  const recap = {
    water: { ml: 2100, targetMl: 2700 },
    protein: { actualG: 130, targetG: 160 },
    calories: { actualKcal: 2200, targetKcal: null },
    training: { done: true, volumeKg: 5000, workingSets: 18 },
  };

  it("joins the recap and tomorrow's session", () => {
    const sections: BriefingSections = {
      recap,
      tomorrow: {
        suggestion: suggestionView({ templateName: "Legs" }),
        caveat: "c",
        day: "2026-07-04",
        prepLine: null,
      },
    };
    expect(eveningHeadline(sections)).toBe(
      "Water 2.1/2.7 L · Protein 130/160 g · Trained ✓ · Tomorrow: Legs",
    );
  });

  it("omits the protein target when none is set and flags a missing session", () => {
    const sections: BriefingSections = {
      recap: {
        ...recap,
        protein: { actualG: 130, targetG: null },
        training: { ...recap.training, done: false },
      },
    };
    expect(eveningHeadline(sections)).toBe("Water 2.1/2.7 L · Protein 130 g · No session");
  });

  it("renders tomorrow's planned rest day", () => {
    const sections: BriefingSections = {
      tomorrow: {
        suggestion: suggestionView({ kind: "REST", templateId: null, templateName: null }),
        caveat: "c",
        day: "2026-07-04",
        prepLine: null,
      },
    };
    expect(eveningHeadline(sections)).toBe("Tomorrow: Rest day");
  });

  it("returns an empty string when nothing is available", () => {
    expect(eveningHeadline({})).toBe("");
  });
});
