-- CreateEnum
CREATE TYPE "SupplementTimeGroup" AS ENUM ('MORNING', 'EVENING', 'PRE_WORKOUT');

-- CreateTable
CREATE TABLE "supplements" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dose" DECIMAL(8,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "time_group" "SupplementTimeGroup" NOT NULL,
    "position" INTEGER NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplement_logs" (
    "id" TEXT NOT NULL,
    "supplement_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "taken_at" TIMESTAMPTZ(6) NOT NULL,
    "dose_snapshot" DECIMAL(8,2) NOT NULL,
    "unit_snapshot" TEXT NOT NULL,
    "origin" "EntryOrigin" NOT NULL,

    CONSTRAINT "supplement_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplements_time_group_position_idx" ON "supplements"("time_group", "position");

-- CreateIndex
CREATE INDEX "supplement_logs_day_idx" ON "supplement_logs"("day");

-- CreateIndex
CREATE UNIQUE INDEX "supplement_logs_supplement_id_day_key" ON "supplement_logs"("supplement_id", "day");

-- AddForeignKey
ALTER TABLE "supplement_logs" ADD CONSTRAINT "supplement_logs_supplement_id_fkey" FOREIGN KEY ("supplement_id") REFERENCES "supplements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Repoint daily_summary.supplements_taken at the new supplement_logs table now that
-- supplement_entries is no longer written. Non-destructive (CREATE OR REPLACE VIEW);
-- the water-target formula and every other column are unchanged. supplement_entries
-- stays in the days union so historical days that only carried legacy rows still show.
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
  SELECT day, COUNT(*) AS supplements_taken FROM supplement_logs GROUP BY day
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
  ROUND(cfg.base_target_ml + COALESCE(st.stimulant_mg, 0) * cfg.ml_per_mg) AS water_target_ml,
  COALESCE(st.stimulant_mg, 0) AS stimulant_mg,
  ld.lifting_volume_kg,
  ld.working_sets,
  sup.supplements_taken
FROM days d
CROSS JOIN cfg
LEFT JOIN weight_avg     wa  ON wa.day  = d.day
LEFT JOIN daily_sleep    dsl ON dsl.day = d.day
LEFT JOIN daily_readiness drd ON drd.day = d.day
LEFT JOIN sleep_daily    sd  ON sd.day  = d.day
LEFT JOIN daily_activity da  ON da.day  = d.day
LEFT JOIN food_daily     fd  ON fd.day  = d.day
LEFT JOIN water_daily    wd  ON wd.day  = d.day
LEFT JOIN stim_daily     st  ON st.day  = d.day
LEFT JOIN lift_daily     ld  ON ld.day  = d.day
LEFT JOIN supp_daily     sup ON sup.day = d.day;
