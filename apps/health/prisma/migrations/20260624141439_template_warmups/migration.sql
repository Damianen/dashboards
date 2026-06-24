-- CreateEnum
CREATE TYPE "WarmupWeightMode" AS ENUM ('ABSOLUTE', 'PERCENT');

-- CreateTable
CREATE TABLE "template_warmup_sets" (
    "id" TEXT NOT NULL,
    "template_exercise_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "reps" INTEGER NOT NULL,
    "weight_mode" "WarmupWeightMode" NOT NULL,
    "weight_kg" DECIMAL(5,2),
    "percent_of_working" DECIMAL(5,2),

    CONSTRAINT "template_warmup_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_plan_warmups" (
    "id" TEXT NOT NULL,
    "plan_item_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "reps" INTEGER NOT NULL,
    "weight_mode" "WarmupWeightMode" NOT NULL,
    "weight_kg" DECIMAL(5,2),
    "percent_of_working" DECIMAL(5,2),

    CONSTRAINT "session_plan_warmups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "template_warmup_sets_template_exercise_id_idx" ON "template_warmup_sets"("template_exercise_id");

-- CreateIndex
CREATE UNIQUE INDEX "template_warmup_sets_template_exercise_id_position_key" ON "template_warmup_sets"("template_exercise_id", "position");

-- CreateIndex
CREATE INDEX "session_plan_warmups_plan_item_id_idx" ON "session_plan_warmups"("plan_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_plan_warmups_plan_item_id_position_key" ON "session_plan_warmups"("plan_item_id", "position");

-- AddForeignKey
ALTER TABLE "template_warmup_sets" ADD CONSTRAINT "template_warmup_sets_template_exercise_id_fkey" FOREIGN KEY ("template_exercise_id") REFERENCES "template_exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_plan_warmups" ADD CONSTRAINT "session_plan_warmups_plan_item_id_fkey" FOREIGN KEY ("plan_item_id") REFERENCES "session_plan_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

