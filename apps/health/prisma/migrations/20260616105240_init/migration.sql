-- CreateEnum
CREATE TYPE "Source" AS ENUM ('WITHINGS', 'OURA', 'GOOGLE_HEALTH', 'MANUAL');

-- CreateEnum
CREATE TYPE "EntryOrigin" AS ENUM ('PWA', 'MCP');

-- CreateEnum
CREATE TYPE "MealSlot" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK');

-- CreateEnum
CREATE TYPE "SyncSource" AS ENUM ('OURA', 'WITHINGS', 'GOOGLE_HEALTH');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'OK', 'ERROR');

-- CreateEnum
CREATE TYPE "OauthProvider" AS ENUM ('WITHINGS', 'GOOGLE');

-- CreateTable
CREATE TABLE "weight_measurements" (
    "id" TEXT NOT NULL,
    "measured_at" TIMESTAMPTZ(6) NOT NULL,
    "day" DATE NOT NULL,
    "weight_kg" DECIMAL(5,2) NOT NULL,
    "body_fat_pct" DECIMAL(4,1),
    "muscle_mass_kg" DECIMAL(5,2),
    "hydration_kg" DECIMAL(5,2),
    "bone_mass_kg" DECIMAL(4,2),
    "source" "Source" NOT NULL DEFAULT 'WITHINGS',
    "external_id" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weight_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sleep_sessions" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "bedtime_start" TIMESTAMPTZ(6) NOT NULL,
    "bedtime_end" TIMESTAMPTZ(6) NOT NULL,
    "total_sleep_min" INTEGER NOT NULL,
    "deep_min" INTEGER,
    "rem_min" INTEGER,
    "light_min" INTEGER,
    "awake_min" INTEGER,
    "efficiency" INTEGER,
    "latency_sec" INTEGER,
    "avg_hr_bpm" DECIMAL(5,2),
    "avg_hrv_ms" INTEGER,
    "lowest_hr_bpm" INTEGER,
    "source" "Source" NOT NULL DEFAULT 'OURA',
    "external_id" TEXT NOT NULL,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sleep_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_sleep" (
    "day" DATE NOT NULL,
    "score" INTEGER,
    "raw" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_sleep_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "daily_readiness" (
    "day" DATE NOT NULL,
    "score" INTEGER,
    "temperature_deviation" DECIMAL(4,2),
    "resting_hr_bpm" INTEGER,
    "hrv_balance" INTEGER,
    "raw" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_readiness_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "daily_activity" (
    "day" DATE NOT NULL,
    "active_kcal" INTEGER,
    "total_kcal" INTEGER,
    "steps" INTEGER,
    "source" "Source" NOT NULL DEFAULT 'GOOGLE_HEALTH',
    "raw" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_activity_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "food_products" (
    "barcode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "image_url" TEXT,
    "per100g" JSONB NOT NULL,
    "serving_g" DECIMAL(7,1),
    "raw" JSONB,
    "fetched_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_products_pkey" PRIMARY KEY ("barcode")
);

-- CreateTable
CREATE TABLE "food_entries" (
    "id" TEXT NOT NULL,
    "eaten_at" TIMESTAMPTZ(6) NOT NULL,
    "day" DATE NOT NULL,
    "product_barcode" TEXT,
    "custom_name" TEXT,
    "quantity_g" DECIMAL(7,1) NOT NULL,
    "kcal" DECIMAL(7,1) NOT NULL,
    "protein_g" DECIMAL(6,1) NOT NULL,
    "carb_g" DECIMAL(6,1) NOT NULL,
    "fat_g" DECIMAL(6,1) NOT NULL,
    "fiber_g" DECIMAL(6,1),
    "sugar_g" DECIMAL(6,1),
    "salt_g" DECIMAL(6,2),
    "micros" JSONB,
    "meal" "MealSlot",
    "origin" "EntryOrigin" NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercises" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "muscle_group" TEXT,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lifting_sessions" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "notes" TEXT,

    CONSTRAINT "lifting_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lifting_sets" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "set_number" INTEGER NOT NULL,
    "reps" INTEGER NOT NULL,
    "weight_kg" DECIMAL(5,2) NOT NULL,
    "rpe" DECIMAL(3,1),
    "is_warmup" BOOLEAN NOT NULL DEFAULT false,
    "logged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origin" "EntryOrigin" NOT NULL,

    CONSTRAINT "lifting_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "water_entries" (
    "id" TEXT NOT NULL,
    "logged_at" TIMESTAMPTZ(6) NOT NULL,
    "day" DATE NOT NULL,
    "amount_ml" INTEGER NOT NULL,
    "origin" "EntryOrigin" NOT NULL,

    CONSTRAINT "water_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stimulant_entries" (
    "id" TEXT NOT NULL,
    "logged_at" TIMESTAMPTZ(6) NOT NULL,
    "day" DATE NOT NULL,
    "substance" TEXT NOT NULL DEFAULT 'caffeine',
    "amount_mg" DECIMAL(7,1) NOT NULL,
    "origin" "EntryOrigin" NOT NULL,
    "notes" TEXT,

    CONSTRAINT "stimulant_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplement_entries" (
    "id" TEXT NOT NULL,
    "logged_at" TIMESTAMPTZ(6) NOT NULL,
    "day" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "dose" DECIMAL(8,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "origin" "EntryOrigin" NOT NULL,

    CONSTRAINT "supplement_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fail_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("endpoint")
);

-- CreateTable
CREATE TABLE "oauth_tokens" (
    "provider" "OauthProvider" NOT NULL,
    "access_token_enc" TEXT NOT NULL,
    "refresh_token_enc" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "scope" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_tokens_pkey" PRIMARY KEY ("provider")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "source" "SyncSource" NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "items_upserted" INTEGER NOT NULL DEFAULT 0,
    "window_start" TIMESTAMPTZ(6),
    "window_end" TIMESTAMPTZ(6),
    "error" TEXT,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weight_measurements_external_id_key" ON "weight_measurements"("external_id");

-- CreateIndex
CREATE INDEX "weight_measurements_day_idx" ON "weight_measurements"("day");

-- CreateIndex
CREATE UNIQUE INDEX "sleep_sessions_external_id_key" ON "sleep_sessions"("external_id");

-- CreateIndex
CREATE INDEX "sleep_sessions_day_idx" ON "sleep_sessions"("day");

-- CreateIndex
CREATE INDEX "food_entries_day_idx" ON "food_entries"("day");

-- CreateIndex
CREATE UNIQUE INDEX "exercises_name_key" ON "exercises"("name");

-- CreateIndex
CREATE INDEX "lifting_sessions_day_idx" ON "lifting_sessions"("day");

-- CreateIndex
CREATE INDEX "lifting_sets_exercise_id_logged_at_idx" ON "lifting_sets"("exercise_id", "logged_at");

-- CreateIndex
CREATE INDEX "water_entries_day_idx" ON "water_entries"("day");

-- CreateIndex
CREATE INDEX "stimulant_entries_day_idx" ON "stimulant_entries"("day");

-- CreateIndex
CREATE INDEX "supplement_entries_day_idx" ON "supplement_entries"("day");

-- CreateIndex
CREATE INDEX "sync_runs_source_started_at_idx" ON "sync_runs"("source", "started_at");

-- AddForeignKey
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_product_barcode_fkey" FOREIGN KEY ("product_barcode") REFERENCES "food_products"("barcode") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifting_sets" ADD CONSTRAINT "lifting_sets_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "lifting_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifting_sets" ADD CONSTRAINT "lifting_sets_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
