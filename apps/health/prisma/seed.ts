import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

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

  console.log(
    `Seeded ${settings.length} settings and ${exercises.length} exercises.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
