import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// Default category tree. The repo is public — these are generic buckets, never
// real merchants, employers, or IBANs (apps/finance/CLAUDE.md). Uncategorized is
// only a display label for the NULL-category bucket; Internal transfer rows are
// driven by the isInternalTransfer flag, not this category. Idempotent — colors
// and kinds are authoritative on re-run.
const CATEGORIES: { name: string; kind: "income" | "expense"; color: string }[] =
  [
    { name: "Groceries", kind: "expense", color: "#22c55e" },
    { name: "Eating out", kind: "expense", color: "#f97316" },
    { name: "Transport", kind: "expense", color: "#3b82f6" },
    { name: "Housing", kind: "expense", color: "#8b5cf6" },
    { name: "Utilities", kind: "expense", color: "#06b6d4" },
    { name: "Subscriptions", kind: "expense", color: "#ec4899" },
    { name: "Health", kind: "expense", color: "#ef4444" },
    { name: "Shopping", kind: "expense", color: "#eab308" },
    { name: "Salary", kind: "income", color: "#16a34a" },
    { name: "Other income", kind: "income", color: "#14b8a6" },
    { name: "Internal transfer", kind: "expense", color: "#64748b" },
    { name: "Uncategorized", kind: "expense", color: "#9ca3af" },
  ];

async function main() {
  for (const c of CATEGORIES) {
    await prisma.category.upsert({
      where: { name: c.name },
      update: { kind: c.kind, color: c.color },
      create: c,
    });
  }
  console.log(`Seeded ${CATEGORIES.length} reference categories.`);

  // Default large-transaction alert threshold (EUR). Create-only so a user's
  // adjusted value survives a re-seed. getLargeTxnThreshold() also defaults to
  // this when the row is absent — seeding just makes it visible in /settings.
  const existing = await prisma.setting.findUnique({
    where: { key: "large_txn_threshold_eur" },
  });
  if (!existing) {
    await prisma.setting.create({
      data: { key: "large_txn_threshold_eur", value: "250.00" },
    });
    console.log("Seeded default large_txn_threshold_eur = 250.00");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
