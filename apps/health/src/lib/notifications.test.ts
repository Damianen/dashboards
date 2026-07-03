import { describe, expect, it } from "vitest";

import { SyncStatus } from "@/generated/prisma/client";
import {
  eveningBriefingMessage,
  formatLiters,
  isOkToErrorTransition,
  morningBriefingMessage,
  recoveryHeadsUpMessage,
  streakMilestoneMessage,
  waterNudgeMessage,
  weeklySummaryMessage,
} from "./notifications";

describe("formatLiters", () => {
  it("renders one decimal litre", () => {
    expect(formatLiters(1100)).toBe("1.1 L");
    expect(formatLiters(2700)).toBe("2.7 L");
    expect(formatLiters(0)).toBe("0.0 L");
  });
});

describe("waterNudgeMessage", () => {
  it("nudges with the litres remaining and the day's target", () => {
    const msg = waterNudgeMessage(1600, 2700);
    expect(msg).not.toBeNull();
    expect(msg?.body).toBe("1.1 L to go — target 2.7 L today");
  });

  it("returns null exactly at the target (no nudge)", () => {
    expect(waterNudgeMessage(2700, 2700)).toBeNull();
  });

  it("returns null when over the target", () => {
    expect(waterNudgeMessage(3000, 2700)).toBeNull();
  });
});

describe("isOkToErrorTransition", () => {
  it("is true only when the latest failed and the previous was OK", () => {
    expect(isOkToErrorTransition(SyncStatus.ERROR, SyncStatus.OK)).toBe(true);
  });

  it("is false on a repeated failure", () => {
    expect(isOkToErrorTransition(SyncStatus.ERROR, SyncStatus.ERROR)).toBe(
      false,
    );
  });

  it("is false when still healthy", () => {
    expect(isOkToErrorTransition(SyncStatus.OK, SyncStatus.OK)).toBe(false);
  });

  it("is false when there is no previous run", () => {
    expect(isOkToErrorTransition(SyncStatus.ERROR, undefined)).toBe(false);
  });

  it("is false when the previous run was still running", () => {
    expect(isOkToErrorTransition(SyncStatus.ERROR, SyncStatus.RUNNING)).toBe(
      false,
    );
  });
});

describe("weeklySummaryMessage", () => {
  it("formats independent metrics with a signed weight delta", () => {
    const msg = weeklySummaryMessage({
      weight7dAvgDeltaKg: -0.3,
      totalLiftingVolumeKg: 12300,
      avgSleepScore: 82,
    });
    expect(msg.title).toBe("Weekly summary");
    expect(msg.body).toBe(
      "Weight −0.3 kg vs last week · Lifting 12,300 kg · Sleep 82 avg",
    );
  });

  it("deep-links into the weekly review on the Insights page", () => {
    const msg = weeklySummaryMessage({
      weight7dAvgDeltaKg: null,
      totalLiftingVolumeKg: null,
      avgSleepScore: null,
    });
    expect(msg.url).toBe("/insights?view=weekly");
  });

  it("renders a positive delta with a plus sign", () => {
    const msg = weeklySummaryMessage({
      weight7dAvgDeltaKg: 0.2,
      totalLiftingVolumeKg: 0,
      avgSleepScore: 70,
    });
    expect(msg.body).toBe(
      "Weight +0.2 kg vs last week · Lifting 0 kg · Sleep 70 avg",
    );
  });

  it("renders missing metrics as em dashes", () => {
    const msg = weeklySummaryMessage({
      weight7dAvgDeltaKg: null,
      totalLiftingVolumeKg: null,
      avgSleepScore: null,
    });
    expect(msg.body).toBe("Weight — vs last week · Lifting — · Sleep — avg");
  });
});

describe("streakMilestoneMessage", () => {
  it("celebrates a food-logging milestone", () => {
    const msg = streakMilestoneMessage("food", 7);
    expect(msg.title).toBe("7-day streak 🔥");
    expect(msg.body).toBe("7 days of food logging in a row — keep it going!");
    expect(msg.url).toBe("/");
  });

  it("labels the supplement streak distinctly", () => {
    expect(streakMilestoneMessage("supplements", 30).body).toBe(
      "30 days of supplements in a row — keep it going!",
    );
  });
});

describe("recoveryHeadsUpMessage", () => {
  it("names a single off-baseline signal with the medical-advice caveat", () => {
    const msg = recoveryHeadsUpMessage(["body temperature"]);
    expect(msg?.title).toBe("Heads up — possible under-recovery");
    expect(msg?.body).toBe(
      "Body temperature is off your recent baseline. Might be a good day to take it easy. Trend signal, not medical advice.",
    );
    expect(msg?.url).toBe("/insights");
  });

  it("lists several signals and keeps acronyms intact", () => {
    expect(recoveryHeadsUpMessage(["resting heart rate", "HRV", "body temperature"])?.body).toBe(
      "Resting heart rate, HRV and body temperature are off your recent baseline. Might be a good day to take it easy. Trend signal, not medical advice.",
    );
  });

  it("returns null when nothing is off baseline", () => {
    expect(recoveryHeadsUpMessage([])).toBeNull();
  });
});

describe("morningBriefingMessage", () => {
  it("carries the headline and the morning deep link", () => {
    const msg = morningBriefingMessage("Readiness 82 · Push #2 · 2.7 L target");
    expect(msg.title).toBe("Morning briefing");
    expect(msg.body).toBe("Readiness 82 · Push #2 · 2.7 L target");
    expect(msg.url).toBe("/?briefing=morning");
  });

  it("falls back to a sane body when the headline is empty", () => {
    expect(morningBriefingMessage("").body).toBe("Your day's plan is ready.");
  });
});

describe("eveningBriefingMessage", () => {
  it("carries the headline and the evening deep link", () => {
    const msg = eveningBriefingMessage("Water 2.1/2.7 L · Trained ✓");
    expect(msg.title).toBe("Evening briefing");
    expect(msg.body).toBe("Water 2.1/2.7 L · Trained ✓");
    expect(msg.url).toBe("/?briefing=evening");
  });

  it("mentions unchecked supplements and the water shortfall", () => {
    const msg = eveningBriefingMessage("Water 2.1/2.7 L", {
      supplementGroups: [{ remaining: 2 }, { remaining: 1 }],
      waterShortfallMl: 600,
    });
    expect(msg.body).toBe("Water 2.1/2.7 L · 3 supplements and 0.6 L water still open");
  });

  it("uses the singular for one open supplement and skips a zero shortfall", () => {
    const msg = eveningBriefingMessage("Recap", {
      supplementGroups: [{ remaining: 1 }],
      waterShortfallMl: null,
    });
    expect(msg.body).toBe("Recap · 1 supplement still open");
  });

  it("skips the unfinished mention when everything is done", () => {
    const msg = eveningBriefingMessage("All good", {
      supplementGroups: [],
      waterShortfallMl: null,
    });
    expect(msg.body).toBe("All good");
  });

  it("falls back to a sane body when the headline is empty and nothing is open", () => {
    expect(eveningBriefingMessage("").body).toBe("Your day's recap is ready.");
  });
});
