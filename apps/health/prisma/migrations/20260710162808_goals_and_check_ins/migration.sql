-- CreateEnum
CREATE TYPE "GoalPhase" AS ENUM ('CUT', 'BULK', 'MAINTAIN');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "CheckInStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'AUTO_APPLIED', 'DISMISSED');

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "goal_weight_kg" DECIMAL(5,2) NOT NULL,
    "target_date" DATE NOT NULL,
    "start_date" DATE NOT NULL,
    "start_trend_weight_kg" DECIMAL(5,2) NOT NULL,
    "phase" "GoalPhase" NOT NULL,
    "current_target_kcal" INTEGER NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "completion_notified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_check_ins" (
    "id" TEXT NOT NULL,
    "goal_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "planned_rate_kg_wk" DECIMAL(4,3) NOT NULL,
    "actual_rate_kg_wk" DECIMAL(4,3),
    "previous_target_kcal" INTEGER NOT NULL,
    "proposed_target_kcal" INTEGER NOT NULL,
    "status" "CheckInStatus" NOT NULL DEFAULT 'PROPOSED',
    "note" TEXT,
    "decided_at" TIMESTAMPTZ(6),
    "decided_via" "EntryOrigin",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "goals_status_idx" ON "goals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "goal_check_ins_goal_id_day_key" ON "goal_check_ins"("goal_id", "day");

-- AddForeignKey
ALTER TABLE "goal_check_ins" ADD CONSTRAINT "goal_check_ins_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One ACTIVE goal at a time (hand-written: Prisma can't express partial unique
-- indexes). The service checks before insert; this is the race backstop.
CREATE UNIQUE INDEX "goals_one_active_idx" ON "goals"("status") WHERE "status" = 'ACTIVE';
