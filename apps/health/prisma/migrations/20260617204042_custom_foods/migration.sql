-- AlterTable
ALTER TABLE "food_entries" ADD COLUMN     "custom_food_id" TEXT;

-- CreateTable
CREATE TABLE "custom_foods" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "per100g" JSONB NOT NULL,
    "serving_g" DECIMAL(7,1),
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_foods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_foods_name_idx" ON "custom_foods"("name");

-- AddForeignKey
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_custom_food_id_fkey" FOREIGN KEY ("custom_food_id") REFERENCES "custom_foods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
