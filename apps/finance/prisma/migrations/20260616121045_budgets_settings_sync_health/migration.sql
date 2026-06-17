-- AlterTable
ALTER TABLE "BankConnection" ADD COLUMN     "consecutiveFailures" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);
