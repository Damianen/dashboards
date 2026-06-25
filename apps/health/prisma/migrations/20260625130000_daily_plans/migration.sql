-- CreateTable
CREATE TABLE "daily_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_plan_items" (
    "id" TEXT NOT NULL,
    "daily_plan_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "product_barcode" TEXT,
    "custom_food_id" TEXT,
    "meal_id" TEXT,
    "quantity_g" DECIMAL(7,1),
    "portions" DECIMAL(6,2),
    "meal_slot" "MealSlot",

    CONSTRAINT "daily_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_plans_name_key" ON "daily_plans"("name");

-- CreateIndex
CREATE INDEX "daily_plans_archived_idx" ON "daily_plans"("archived");

-- CreateIndex
CREATE INDEX "daily_plan_items_daily_plan_id_idx" ON "daily_plan_items"("daily_plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_plan_items_daily_plan_id_position_key" ON "daily_plan_items"("daily_plan_id", "position");

-- AddForeignKey
ALTER TABLE "daily_plan_items" ADD CONSTRAINT "daily_plan_items_daily_plan_id_fkey" FOREIGN KEY ("daily_plan_id") REFERENCES "daily_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_plan_items" ADD CONSTRAINT "daily_plan_items_product_barcode_fkey" FOREIGN KEY ("product_barcode") REFERENCES "food_products"("barcode") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_plan_items" ADD CONSTRAINT "daily_plan_items_custom_food_id_fkey" FOREIGN KEY ("custom_food_id") REFERENCES "custom_foods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_plan_items" ADD CONSTRAINT "daily_plan_items_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "meals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

