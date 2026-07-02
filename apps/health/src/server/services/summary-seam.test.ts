import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_BASE_TARGET_ML,
  DEFAULT_ML_PER_MG_STIMULANT,
} from "@/lib/water-defaults";
import { SUMMARY_COLUMNS, TREND_COLUMNS } from "./summary";

/**
 * Pins the daily_summary "×5 seam": the canonical view SQL
 * (prisma/views/daily_summary.sql), the SUMMARY_COLUMNS list getDailySummary
 * builds its SELECT from, the DailySummary interface (typechecked against
 * SUMMARY_COLUMNS), the trendMetricSchema enum (typechecked against
 * TREND_COLUMNS), and the secondary raw selects in observations/tdee/weight-goal.
 * When one of these drifts — a column added to the view but not surfaced, a
 * TREND_COLUMNS value that no longer exists, a reordered view — a test fails
 * here instead of a runtime SQL error.
 */

const VIEW_SQL = readFileSync(
  fileURLToPath(new URL("../../../prisma/views/daily_summary.sql", import.meta.url)),
  "utf8",
);

/** Output column names of the view's final SELECT, in order. */
function parseViewColumns(sql: string): string[] {
  const noComments = sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
  // The final SELECT sits between the last CTE's closing paren and "FROM days".
  const match = /\)\s*SELECT([\s\S]*?)\nFROM days/.exec(noComments);
  if (!match) throw new Error("Could not locate the view's final SELECT");
  const body = match[1]!;
  // Split on top-level commas (depth-counting so ROUND(x, 2) etc. stay whole).
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts
    .map((p) => p.trim())
    .filter((p) => p !== "")
    .map((p) => {
      const alias = /\bAS\s+"?(\w+)"?\s*$/i.exec(p);
      if (alias) return alias[1]!;
      // Bare column reference: identifier after the last dot ("wd.water_ml").
      const bare = /(\w+)\s*$/.exec(p);
      if (!bare) throw new Error(`Unparseable select item: ${p}`);
      return bare[1]!;
    });
}

const viewColumns = parseViewColumns(VIEW_SQL);

// The view is append-only: this literal pins names AND order. A legitimate new
// column is a one-line append here (and everywhere this file points).
const EXPECTED_VIEW_COLUMNS = [
  "day",
  "weight_kg",
  "weight_7d_avg",
  "sleep_score",
  "readiness_score",
  "total_sleep_min",
  "active_kcal",
  "steps",
  "intake_kcal",
  "protein_g",
  "carb_g",
  "fat_g",
  "water_ml",
  "water_target_ml",
  "stimulant_mg",
  "lifting_volume_kg",
  "working_sets",
  "supplements_taken",
  "caffeine_mg",
  "body_fat_pct",
  "muscle_mass_kg",
  "deep_min",
  "rem_min",
  "hrv_ms",
  "resting_hr_bpm",
  "fiber_g",
] as const;

describe("daily_summary view (canonical SQL)", () => {
  it("has the pinned column names in the pinned (append-only) order", () => {
    expect(viewColumns).toEqual([...EXPECTED_VIEW_COLUMNS]);
  });

  it("has no duplicate output columns", () => {
    expect(new Set(viewColumns).size).toBe(viewColumns.length);
  });

  it("pins the water-formula fallback literals to the shared constants", () => {
    const base = /'water\.baseTargetMl'\)\s*,\s*([\d.]+)\)/.exec(VIEW_SQL);
    const perMg = /'water\.mlPerMgStimulant'\)\s*,\s*([\d.]+)\)/.exec(VIEW_SQL);
    expect(Number(base?.[1])).toBe(DEFAULT_BASE_TARGET_ML);
    expect(Number(perMg?.[1])).toBe(DEFAULT_ML_PER_MG_STIMULANT);
  });

  // The deployed view is whatever CREATE OR REPLACE VIEW last shipped in a
  // migration — the canonical file only matters if migrations keep copying it
  // verbatim. Pin the two together so editing one without the other fails here
  // instead of as a runtime SQL error against a stale deployed view.
  it("matches the latest view migration (modulo comments/whitespace)", () => {
    const migrationsDir = fileURLToPath(
      new URL("../../../prisma/migrations", import.meta.url),
    );
    const extractViewBlock = (sql: string): string | null => {
      const start = sql.indexOf("CREATE OR REPLACE VIEW daily_summary");
      if (start === -1) return null;
      const end = sql.indexOf(";", start);
      return sql.slice(start, end === -1 ? undefined : end + 1);
    };
    const normalize = (sql: string): string =>
      sql
        .split("\n")
        .map((line) => line.replace(/--.*$/, ""))
        .join("\n")
        .replace(/\s+/g, " ")
        .trim();

    let latest: string | null = null;
    const dirs = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const dir of dirs) {
      const block = extractViewBlock(
        readFileSync(join(migrationsDir, dir, "migration.sql"), "utf8"),
      );
      if (block) latest = block;
    }

    expect(latest).not.toBeNull();
    expect(normalize(latest!)).toBe(normalize(extractViewBlock(VIEW_SQL)!));
  });
});

describe("SUMMARY_COLUMNS ↔ view", () => {
  const sqlNames = SUMMARY_COLUMNS.map(([sql]) => sql.replace(/::\w+$/, ""));

  it("selects exactly the view's columns (no more, no less)", () => {
    expect([...sqlNames].sort()).toEqual([...viewColumns].sort());
  });

  it("has unique aliases", () => {
    const aliases = SUMMARY_COLUMNS.map(([, alias]) => alias);
    expect(new Set(aliases).size).toBe(aliases.length);
  });
});

describe("TREND_COLUMNS ↔ view", () => {
  it("every trend metric maps to an existing view column", () => {
    for (const column of Object.values(TREND_COLUMNS)) {
      expect(viewColumns, `trend column ${column}`).toContain(column);
    }
  });
});

describe("secondary daily_summary consumers", () => {
  // Raw selects at observations.ts (getObservations), tdee.ts (getTdeeEstimate),
  // and weight-goal.ts — update these literals when those queries change.
  const SECONDARY_SELECTED_COLUMNS = [
    "day",
    "sleep_score",
    "readiness_score",
    "lifting_volume_kg",
    "weight_7d_avg",
    "intake_kcal",
    "weight_kg",
  ];

  it("only reference columns the view still exposes", () => {
    for (const column of SECONDARY_SELECTED_COLUMNS) {
      expect(viewColumns, `secondary column ${column}`).toContain(column);
    }
  });
});
