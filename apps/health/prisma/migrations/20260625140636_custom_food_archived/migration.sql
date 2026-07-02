-- Custom foods: a soft-archive flag so a food can be retired from the active "My Foods"
-- list without deleting it. Past diary entries snapshot their macros, so archiving (or
-- editing) a custom food never rewrites history. Additive only (NOT NULL + DEFAULT false,
-- safe for existing rows) — non-destructive.

-- AlterTable
ALTER TABLE "custom_foods" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "custom_foods_archived_idx" ON "custom_foods"("archived");

