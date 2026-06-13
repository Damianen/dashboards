import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateKeyBetween } from "fractional-indexing";

import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const inbox = await prisma.project.findFirst({ where: { isInbox: true } });
  if (inbox) {
    console.log(`Inbox already exists (${inbox.id}) — nothing to do.`);
    return;
  }

  const created = await prisma.project.create({
    data: {
      name: "Inbox",
      isInbox: true,
      order: generateKeyBetween(null, null),
    },
  });
  console.log(`Created Inbox project (${created.id}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
