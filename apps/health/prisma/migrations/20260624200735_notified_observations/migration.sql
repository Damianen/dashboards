-- Observation notifications: dedupe + throttle bookkeeping for pushed observations.
-- Additive only (one new table); no existing tables/columns are touched.

-- CreateTable
CREATE TABLE "notified_observations" (
    "id" TEXT NOT NULL,
    "observation_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "notified_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notified_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notified_observations_observation_id_key" ON "notified_observations"("observation_id");

-- CreateIndex
CREATE INDEX "notified_observations_day_idx" ON "notified_observations"("day");
