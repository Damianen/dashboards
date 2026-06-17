-- CreateEnum
CREATE TYPE "TemplateTargetType" AS ENUM ('REPS', 'VOLUME');

-- AlterTable
ALTER TABLE "lifting_sessions" ADD COLUMN     "template_id" TEXT;

-- CreateTable
CREATE TABLE "workout_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_exercises" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "target_type" "TemplateTargetType" NOT NULL DEFAULT 'REPS',
    "target_sets" INTEGER,
    "rep_min" INTEGER,
    "rep_max" INTEGER,
    "target_weight_kg" DECIMAL(5,2),
    "target_volume_kg" DECIMAL(7,1),
    "rest_sec" INTEGER,
    "notes" TEXT,

    CONSTRAINT "template_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_plan_items" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "target_type" "TemplateTargetType" NOT NULL DEFAULT 'REPS',
    "target_sets" INTEGER,
    "rep_min" INTEGER,
    "rep_max" INTEGER,
    "target_weight_kg" DECIMAL(5,2),
    "target_volume_kg" DECIMAL(7,1),

    CONSTRAINT "session_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workout_templates_name_key" ON "workout_templates"("name");

-- CreateIndex
CREATE INDEX "template_exercises_template_id_idx" ON "template_exercises"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "template_exercises_template_id_position_key" ON "template_exercises"("template_id", "position");

-- CreateIndex
CREATE INDEX "session_plan_items_session_id_idx" ON "session_plan_items"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_plan_items_session_id_position_key" ON "session_plan_items"("session_id", "position");

-- AddForeignKey
ALTER TABLE "lifting_sessions" ADD CONSTRAINT "lifting_sessions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "workout_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_exercises" ADD CONSTRAINT "template_exercises_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "workout_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_exercises" ADD CONSTRAINT "template_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_plan_items" ADD CONSTRAINT "session_plan_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "lifting_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_plan_items" ADD CONSTRAINT "session_plan_items_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
