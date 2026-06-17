import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, TemplateTargetType } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// Deterministic config the daily_summary view reads (water target formula).
const settings: { key: string; value: number }[] = [
  { key: "water.baseTargetMl", value: 2500 },
  { key: "water.mlPerMgStimulant", value: 1.0 },
];

// Default lifting catalogue. `name` is unique, so re-seeding just refreshes
// the muscle group — no duplicates.
const exercises: { name: string; muscleGroup: string }[] = [
  { name: "Bench Press", muscleGroup: "Chest" },
  { name: "Incline Dumbbell Press", muscleGroup: "Chest" },
  { name: "Overhead Press", muscleGroup: "Shoulders" },
  { name: "Squat", muscleGroup: "Quads" },
  { name: "Leg Press", muscleGroup: "Quads" },
  { name: "Romanian Deadlift", muscleGroup: "Hamstrings" },
  { name: "Deadlift", muscleGroup: "Back" },
  { name: "Barbell Row", muscleGroup: "Back" },
  { name: "Lat Pulldown", muscleGroup: "Back" },
  { name: "Pull-up", muscleGroup: "Back" },
  { name: "Bicep Curl", muscleGroup: "Biceps" },
  { name: "Tricep Pushdown", muscleGroup: "Triceps" },
  { name: "Lateral Raise", muscleGroup: "Shoulders" },
  { name: "Leg Curl", muscleGroup: "Hamstrings" },
  { name: "Calf Raise", muscleGroup: "Calves" },
];

// Example workout templates. Each entry references an exercise by its (unique)
// name, which is resolved against the catalogue seeded above. Position is the
// array index. Templates are upserted by name and their TemplateExercise rows
// are replaced on every seed, so re-running never duplicates.
const templates: {
  name: string;
  exercises: {
    name: string;
    targetType: TemplateTargetType;
    targetSets: number;
    repMin: number;
    repMax: number;
  }[];
}[] = [
  {
    name: "Push Day A",
    exercises: [
      { name: "Bench Press", targetType: TemplateTargetType.REPS, targetSets: 4, repMin: 6, repMax: 10 },
      { name: "Overhead Press", targetType: TemplateTargetType.REPS, targetSets: 3, repMin: 8, repMax: 12 },
      { name: "Incline Dumbbell Press", targetType: TemplateTargetType.REPS, targetSets: 3, repMin: 10, repMax: 15 },
      { name: "Tricep Pushdown", targetType: TemplateTargetType.REPS, targetSets: 3, repMin: 12, repMax: 20 },
      { name: "Lateral Raise", targetType: TemplateTargetType.REPS, targetSets: 3, repMin: 12, repMax: 20 },
    ],
  },
  {
    name: "Pull Day A",
    exercises: [
      { name: "Deadlift", targetType: TemplateTargetType.REPS, targetSets: 3, repMin: 4, repMax: 6 },
      { name: "Barbell Row", targetType: TemplateTargetType.REPS, targetSets: 4, repMin: 8, repMax: 12 },
      { name: "Lat Pulldown", targetType: TemplateTargetType.REPS, targetSets: 3, repMin: 10, repMax: 15 },
      { name: "Bicep Curl", targetType: TemplateTargetType.REPS, targetSets: 3, repMin: 12, repMax: 20 },
    ],
  },
];

async function main() {
  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: { key: s.key, value: s.value },
    });
  }

  for (const e of exercises) {
    await prisma.exercise.upsert({
      where: { name: e.name },
      update: { muscleGroup: e.muscleGroup },
      create: { name: e.name, muscleGroup: e.muscleGroup },
    });
  }

  // Exercises are guaranteed to exist now — resolve them by name once.
  const exerciseIdByName = new Map(
    (await prisma.exercise.findMany({ select: { id: true, name: true } })).map(
      (e) => [e.name, e.id] as const,
    ),
  );

  for (const t of templates) {
    const template = await prisma.workoutTemplate.upsert({
      where: { name: t.name },
      update: {},
      create: { name: t.name },
    });
    // Replace the template's exercises rather than appending, so re-seeding is
    // idempotent and respects the @@unique([templateId, position]) constraint.
    await prisma.templateExercise.deleteMany({
      where: { templateId: template.id },
    });
    await prisma.templateExercise.createMany({
      data: t.exercises.map((ex, position) => {
        const exerciseId = exerciseIdByName.get(ex.name);
        if (!exerciseId) {
          throw new Error(`Seed: unknown exercise "${ex.name}"`);
        }
        return {
          templateId: template.id,
          exerciseId,
          position,
          targetType: ex.targetType,
          targetSets: ex.targetSets,
          repMin: ex.repMin,
          repMax: ex.repMax,
        };
      }),
    });
  }

  console.log(
    `Seeded ${settings.length} settings, ${exercises.length} exercises, and ${templates.length} templates.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
