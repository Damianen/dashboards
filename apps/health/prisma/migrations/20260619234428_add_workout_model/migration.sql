-- CreateTable
CREATE TABLE "workouts" (
    "id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'apple_health',
    "type" TEXT NOT NULL,
    "name" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "duration_seconds" INTEGER,
    "day" DATE NOT NULL,
    "distance" DOUBLE PRECISION,
    "active_energy_kcal" DOUBLE PRECISION,
    "avg_heart_rate" INTEGER,
    "max_heart_rate" INTEGER,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workouts_external_id_key" ON "workouts"("external_id");

-- CreateIndex
CREATE INDEX "workouts_day_idx" ON "workouts"("day");
