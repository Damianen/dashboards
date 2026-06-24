-- AlterTable
ALTER TABLE "food_entries" ADD COLUMN     "meal_id" TEXT,
ADD COLUMN     "portions" DECIMAL(6,2),
ALTER COLUMN "quantity_g" DROP NOT NULL;

-- CreateTable
CREATE TABLE "meals" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "yield_portions" DECIMAL(6,2) NOT NULL,
    "per_portion" JSONB NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_items" (
    "id" TEXT NOT NULL,
    "meal_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "product_barcode" TEXT,
    "custom_food_id" TEXT,
    "custom_name" TEXT,
    "child_meal_id" TEXT,
    "quantity_g" DECIMAL(7,1),
    "child_portions" DECIMAL(6,2),
    "kcal" DECIMAL(7,1),
    "protein_g" DECIMAL(6,1),
    "carb_g" DECIMAL(6,1),
    "fat_g" DECIMAL(6,1),
    "fiber_g" DECIMAL(6,1),
    "sugar_g" DECIMAL(6,1),
    "salt_g" DECIMAL(6,2),

    CONSTRAINT "meal_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meals_archived_idx" ON "meals"("archived");

-- CreateIndex
CREATE INDEX "meal_items_meal_id_idx" ON "meal_items"("meal_id");

-- CreateIndex
CREATE INDEX "meal_items_child_meal_id_idx" ON "meal_items"("child_meal_id");

-- AddForeignKey
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "meals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "meals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_product_barcode_fkey" FOREIGN KEY ("product_barcode") REFERENCES "food_products"("barcode") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_custom_food_id_fkey" FOREIGN KEY ("custom_food_id") REFERENCES "custom_foods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_child_meal_id_fkey" FOREIGN KEY ("child_meal_id") REFERENCES "meals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

