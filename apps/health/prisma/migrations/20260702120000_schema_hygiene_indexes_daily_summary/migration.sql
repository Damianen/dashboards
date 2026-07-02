-- Schema hygiene: drop indexes that are leading prefixes of same-table uniques,
-- drop the dead food_entries.micros column (never written or read by the app),
-- add the missing FK-join indexes, promote meal_items(meal_id, position) to the
-- position-unique convention its sibling tables use, and fix weight_7d_avg to a
-- calendar window. Workout.distance/active_energy_kcal stay Float on purpose
-- (wearable estimates; Decimal buys nothing).

-- 1) Redundant single-column indexes covered by a same-table unique's leading prefix
DROP INDEX "meal_items_meal_id_idx";
DROP INDEX "daily_plan_items_daily_plan_id_idx";
DROP INDEX "template_exercises_template_id_idx";
DROP INDEX "template_warmup_sets_template_exercise_id_idx";
DROP INDEX "session_plan_items_session_id_idx";
DROP INDEX "session_plan_warmups_plan_item_id_idx";

-- 2) Dead column (zero references outside the generated client; approved drop)
ALTER TABLE "food_entries" DROP COLUMN "micros";

-- 3) FK-join / cascade-delete indexes
CREATE INDEX "food_entries_custom_food_id_idx" ON "food_entries"("custom_food_id");
CREATE INDEX "food_entries_meal_id_idx" ON "food_entries"("meal_id");
CREATE INDEX "food_entries_product_barcode_idx" ON "food_entries"("product_barcode");
CREATE INDEX "lifting_sets_session_id_idx" ON "lifting_sets"("session_id");

-- 4) Defensive renumber before the unique index. The meals service always writes
--    positions wholesale as 0..n-1 in one transaction, so this is a no-op unless
--    historical data drifted — but a duplicate would abort deploy at boot.
WITH renumbered AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY meal_id ORDER BY position, id) - 1 AS new_position
  FROM meal_items
)
UPDATE meal_items mi
SET position = r.new_position
FROM renumbered r
WHERE r.id = mi.id AND mi.position <> r.new_position;

-- 5) Position-unique replaces the plain index (leading prefix covers the FK join)
CREATE UNIQUE INDEX "meal_items_meal_id_position_key" ON "meal_items"("meal_id", "position");

-- 6) daily_summary: weight_7d_avg switches from a 7-ROW window to a 7-calendar-day
--    RANGE window. Expression change only — column list/order/names/types are
--    unchanged, which CREATE OR REPLACE VIEW requires. Copied verbatim from
--    prisma/views/daily_summary.sql (the canonical source).
CREATE OR REPLACE VIEW daily_summary AS
WITH days AS (
  SELECT day FROM weight_measurements
  UNION SELECT day FROM sleep_sessions
  UNION SELECT day FROM daily_sleep
  UNION SELECT day FROM daily_readiness
  UNION SELECT day FROM daily_activity
  UNION SELECT day FROM food_entries
  UNION SELECT day FROM lifting_sessions
  UNION SELECT day FROM water_entries
  UNION SELECT day FROM stimulant_entries
  UNION SELECT day FROM supplement_entries
  UNION SELECT day FROM supplement_logs
),
cfg AS (
  SELECT
    COALESCE((SELECT (value #>> '{}')::numeric FROM settings WHERE key = 'water.baseTargetMl'), 2500)   AS base_target_ml,
    COALESCE((SELECT (value #>> '{}')::numeric FROM settings WHERE key = 'water.mlPerMgStimulant'), 1.0) AS ml_per_mg
),
-- weight_daily/weight_avg also carry body_fat_pct and muscle_mass_kg (latest
-- measurement of the day). They get NO rolling average — they pass through as-is.
weight_daily AS (
  SELECT DISTINCT ON (day) day, weight_kg, body_fat_pct, muscle_mass_kg
  FROM weight_measurements
  ORDER BY day, measured_at DESC
),
-- weight_7d_avg is a CALENDAR window (this day and the 6 days before it), not the
-- last 7 measurement rows — sparse weigh-ins never smear months-old weights in.
weight_avg AS (
  SELECT day, weight_kg, body_fat_pct, muscle_mass_kg,
         AVG(weight_kg) OVER (ORDER BY day RANGE BETWEEN '6 days'::interval PRECEDING AND CURRENT ROW) AS weight_7d_avg
  FROM weight_daily
),
-- sleep_daily rolls up sleep depth (summed across the day's sessions) and
-- recovery signals: HRV averaged, resting HR as the night's lowest.
sleep_daily AS (
  SELECT day,
         SUM(total_sleep_min) AS total_sleep_min,
         SUM(deep_min)        AS deep_min,
         SUM(rem_min)         AS rem_min,
         AVG(avg_hrv_ms)      AS hrv_ms,
         MIN(lowest_hr_bpm)   AS resting_hr_bpm
  FROM sleep_sessions GROUP BY day
),
food_daily AS (
  SELECT day, SUM(kcal) AS intake_kcal, SUM(protein_g) AS protein_g,
         SUM(carb_g) AS carb_g, SUM(fat_g) AS fat_g, SUM(fiber_g) AS fiber_g
  FROM food_entries GROUP BY day
),
-- Caffeine kept in its OWN CTE, deliberately separate from food_daily's calorie sums,
-- so caffeine can never leak into any kcal/macro number.
food_caf_daily AS (
  SELECT day, SUM(caffeine_mg) AS food_caffeine_mg FROM food_entries GROUP BY day
),
water_daily AS (
  SELECT day, SUM(amount_ml) AS water_ml FROM water_entries GROUP BY day
),
stim_daily AS (
  SELECT day, SUM(amount_mg) AS stimulant_mg FROM stimulant_entries GROUP BY day
),
lift_daily AS (
  SELECT s.day,
         SUM(ls.reps * ls.weight_kg) FILTER (WHERE NOT ls.is_warmup) AS lifting_volume_kg,
         COUNT(*) FILTER (WHERE NOT ls.is_warmup)                    AS working_sets
  FROM lifting_sessions s JOIN lifting_sets ls ON ls.session_id = s.id
  GROUP BY s.day
),
supp_daily AS (
  SELECT day, COUNT(*) AS supplements_taken, SUM(caffeine_snapshot) AS supp_caffeine_mg
  FROM supplement_logs GROUP BY day
)
SELECT
  d.day,
  wa.weight_kg,
  ROUND(wa.weight_7d_avg, 2) AS weight_7d_avg,
  dsl.score AS sleep_score,
  drd.score AS readiness_score,
  sd.total_sleep_min,
  da.active_kcal,            -- TREND SIGNAL ONLY (wearable estimate)
  da.steps,
  fd.intake_kcal, fd.protein_g, fd.carb_g, fd.fat_g,
  COALESCE(wd.water_ml, 0) AS water_ml,
  ROUND(
    cfg.base_target_ml
    + (COALESCE(st.stimulant_mg, 0) + COALESCE(fc.food_caffeine_mg, 0) + COALESCE(sup.supp_caffeine_mg, 0))
      * cfg.ml_per_mg
  ) AS water_target_ml,
  COALESCE(st.stimulant_mg, 0) AS stimulant_mg,
  ld.lifting_volume_kg,
  ld.working_sets,
  sup.supplements_taken,
  COALESCE(st.stimulant_mg, 0) + COALESCE(fc.food_caffeine_mg, 0) + COALESCE(sup.supp_caffeine_mg, 0) AS caffeine_mg,
  -- New columns MUST be appended last (CREATE OR REPLACE VIEW cannot reorder/rename):
  -- body composition, sleep depth, recovery signals, fiber.
  wa.body_fat_pct,
  wa.muscle_mass_kg,
  sd.deep_min,
  sd.rem_min,
  ROUND(sd.hrv_ms)  AS hrv_ms,
  sd.resting_hr_bpm,
  fd.fiber_g
FROM days d
CROSS JOIN cfg
LEFT JOIN weight_avg     wa  ON wa.day  = d.day
LEFT JOIN daily_sleep    dsl ON dsl.day = d.day
LEFT JOIN daily_readiness drd ON drd.day = d.day
LEFT JOIN sleep_daily    sd  ON sd.day  = d.day
LEFT JOIN daily_activity da  ON da.day  = d.day
LEFT JOIN food_daily     fd  ON fd.day  = d.day
LEFT JOIN food_caf_daily fc  ON fc.day  = d.day
LEFT JOIN water_daily    wd  ON wd.day  = d.day
LEFT JOIN stim_daily     st  ON st.day  = d.day
LEFT JOIN lift_daily     ld  ON ld.day  = d.day
LEFT JOIN supp_daily     sup ON sup.day = d.day;
