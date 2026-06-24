-- Caffeine tracking: snapshot caffeine on every logged source and unify it into ONE
-- daily total that drives the water target. Additive columns + CREATE OR REPLACE VIEW
-- only (non-destructive). Caffeine feeds ONLY the unified caffeine total / water target —
-- never any calorie column.

-- AlterTable
ALTER TABLE "food_entries" ADD COLUMN     "caffeine_mg" DECIMAL(7,1);

-- AlterTable
ALTER TABLE "meal_items" ADD COLUMN     "caffeine_mg" DECIMAL(7,1);

-- AlterTable
ALTER TABLE "supplements" ADD COLUMN     "caffeine_mg" DECIMAL(7,1);

-- AlterTable
ALTER TABLE "supplement_logs" ADD COLUMN     "caffeine_snapshot" DECIMAL(7,1);

-- Unify the day's caffeine across ALL sources and feed it to the water target.
-- caffeine_mg = stimulant entries + food entries (incl. meal-logged entries, which
-- write a food_entry) + checked supplements' snapshot. water_target_ml keeps its exact
-- formula (base + caffeine × factor) — it now reads this unified total instead of only
-- stimulant entries. stimulant_mg is retained as an honest stimulant-only sub-metric.
-- Non-destructive (CREATE OR REPLACE VIEW); every other column is unchanged.
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
weight_daily AS (
  SELECT DISTINCT ON (day) day, weight_kg
  FROM weight_measurements
  ORDER BY day, measured_at DESC
),
weight_avg AS (
  SELECT day, weight_kg,
         AVG(weight_kg) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS weight_7d_avg
  FROM weight_daily
),
sleep_daily AS (
  SELECT day, SUM(total_sleep_min) AS total_sleep_min
  FROM sleep_sessions GROUP BY day
),
food_daily AS (
  SELECT day, SUM(kcal) AS intake_kcal, SUM(protein_g) AS protein_g,
         SUM(carb_g) AS carb_g, SUM(fat_g) AS fat_g
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
  -- New column MUST be appended last: CREATE OR REPLACE VIEW cannot reorder/rename
  -- existing view columns, only add at the end.
  COALESCE(st.stimulant_mg, 0) + COALESCE(fc.food_caffeine_mg, 0) + COALESCE(sup.supp_caffeine_mg, 0) AS caffeine_mg
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
