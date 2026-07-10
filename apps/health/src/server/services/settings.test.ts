import { describe, expect, it } from "vitest";

import {
  DEFAULT_BASE_TARGET_ML,
  DEFAULT_ML_PER_MG_STIMULANT,
} from "@/lib/water-defaults";
import {
  BRIEFING_DEFAULTS,
  briefingSettingsFromRows,
  GOAL_SETTINGS_DEFAULTS,
  goalSettingsFromRows,
  waterSettingsFromRows,
} from "./settings";

describe("waterSettingsFromRows", () => {
  it("falls back to the COALESCE defaults when rows are missing", () => {
    expect(waterSettingsFromRows([])).toEqual({
      baseTargetMl: DEFAULT_BASE_TARGET_ML,
      mlPerMgStimulant: DEFAULT_ML_PER_MG_STIMULANT,
    });
    // One present, one missing.
    expect(
      waterSettingsFromRows([{ key: "water.baseTargetMl", value: 3000 }]),
    ).toEqual({
      baseTargetMl: 3000,
      mlPerMgStimulant: DEFAULT_ML_PER_MG_STIMULANT,
    });
  });

  it("Number-coerces stored JSON values (numbers and numeric strings)", () => {
    expect(
      waterSettingsFromRows([
        { key: "water.baseTargetMl", value: "2500" },
        { key: "water.mlPerMgStimulant", value: 1.5 },
      ]),
    ).toEqual({ baseTargetMl: 2500, mlPerMgStimulant: 1.5 });
  });

  it("ignores unrelated keys", () => {
    expect(
      waterSettingsFromRows([{ key: "protein.gPerKg", value: 2 }]),
    ).toEqual({
      baseTargetMl: DEFAULT_BASE_TARGET_ML,
      mlPerMgStimulant: DEFAULT_ML_PER_MG_STIMULANT,
    });
  });
});

describe("briefingSettingsFromRows", () => {
  const storedSchedule = {
    morning: { enabled: false, time: "06:45" },
    evening: { enabled: true, time: "22:15" },
  };

  it("returns every default when no rows exist", () => {
    expect(briefingSettingsFromRows([])).toEqual(BRIEFING_DEFAULTS);
  });

  it("uses stored values when they validate", () => {
    expect(
      briefingSettingsFromRows([
        { key: "briefing.schedule", value: storedSchedule },
        { key: "briefing.modeCutoffHour", value: 13 },
        { key: "briefing.thresholds", value: { goodMin: 80, moderateMin: 65 } },
      ]),
    ).toEqual({
      morning: storedSchedule.morning,
      evening: storedSchedule.evening,
      modeCutoffHour: 13,
      thresholds: { goodMin: 80, moderateMin: 65 },
    });
  });

  it("safe-parse falls back per part on invalid stored JSON", () => {
    const settings = briefingSettingsFromRows([
      // Bad time format → whole schedule falls back.
      {
        key: "briefing.schedule",
        value: { morning: { enabled: true, time: "7:30" }, evening: null },
      },
      { key: "briefing.modeCutoffHour", value: "not-a-number" },
      // Violates moderateMin < goodMin → thresholds fall back.
      { key: "briefing.thresholds", value: { goodMin: 60, moderateMin: 75 } },
    ]);
    expect(settings).toEqual(BRIEFING_DEFAULTS);
  });

  it("keeps valid parts while an invalid part falls back", () => {
    const settings = briefingSettingsFromRows([
      { key: "briefing.schedule", value: storedSchedule },
      { key: "briefing.thresholds", value: "corrupt" },
    ]);
    expect(settings.morning).toEqual(storedSchedule.morning);
    expect(settings.evening).toEqual(storedSchedule.evening);
    expect(settings.modeCutoffHour).toBe(BRIEFING_DEFAULTS.modeCutoffHour);
    expect(settings.thresholds).toEqual(BRIEFING_DEFAULTS.thresholds);
  });
});

describe("goalSettingsFromRows", () => {
  const stored = {
    maxLossPctBwPerWeek: 0.5,
    maxGainPctBwPerWeek: 0.25,
    floorKcal: 1600,
    adjustmentCapKcal: 100,
    autoApplyCheckIns: true,
    proteinGPerKg: { cut: 2.4, maintain: 2.1, bulk: 1.9 },
  };

  it("returns the defaults when the row is missing", () => {
    expect(goalSettingsFromRows([])).toEqual(GOAL_SETTINGS_DEFAULTS);
  });

  it("uses the stored row when it validates", () => {
    expect(
      goalSettingsFromRows([{ key: "goals.settings", value: stored }]),
    ).toEqual(stored);
  });

  it("falls back wholesale on invalid stored JSON", () => {
    // Loss cap out of bounds → the whole row is rejected, defaults apply.
    expect(
      goalSettingsFromRows([
        { key: "goals.settings", value: { ...stored, maxLossPctBwPerWeek: 5 } },
      ]),
    ).toEqual(GOAL_SETTINGS_DEFAULTS);
    expect(
      goalSettingsFromRows([{ key: "goals.settings", value: "corrupt" }]),
    ).toEqual(GOAL_SETTINGS_DEFAULTS);
  });

  it("ignores unrelated keys", () => {
    expect(
      goalSettingsFromRows([{ key: "protein.gPerKg", value: 2 }]),
    ).toEqual(GOAL_SETTINGS_DEFAULTS);
  });
});
