-- Streak milestone notifications: dedupe bookkeeping for celebrated streak milestones.
-- The composite unique (streak_type, milestone, start_day) fires a milestone once per
-- streak run, while a fresh streak (new start_day) can celebrate again. Additive only
-- (one new table); no existing tables/columns are touched.

-- CreateTable
CREATE TABLE "notified_streak_milestones" (
    "id" TEXT NOT NULL,
    "streak_type" TEXT NOT NULL,
    "milestone" INTEGER NOT NULL,
    "start_day" DATE NOT NULL,
    "notified_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notified_streak_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notified_streak_milestones_streak_type_milestone_start_day_key" ON "notified_streak_milestones"("streak_type", "milestone", "start_day");
