import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// Generic, obviously-fake reference categories. The repo is public — never put
// real merchants, employers, or IBANs here (apps/finance/CLAUDE.md). Categories
// are not wired into any service yet; this just gives later slices a starting
// taxonomy. Idempotent: safe to re-run.
const CATEGORIES: { name: string; kind: "income" | "expense" }[] = [
  { name: "Income", kind: "income" },
  { name: "Groceries", kind: "expense" },
  { name: "Transport", kind: "expense" },
  { name: "Housing", kind: "expense" },
  { name: "Uncategorized", kind: "expense" },
];

async function main() {
  for (const c of CATEGORIES) {
    await prisma.category.upsert({
      where: { name: c.name },
      update: {},
      create: c,
    });
  }
  console.log(`Seeded ${CATEGORIES.length} reference categories.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
