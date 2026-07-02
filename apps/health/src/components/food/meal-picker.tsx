import { Segmented } from "@/components/ui/segmented";
import { MEAL_LABELS, MEAL_ORDER, type MealSlot } from "@/lib/food";

/** A 4-up segmented control for choosing a meal slot. */
export function MealPicker({
  value,
  onChange,
}: {
  value: MealSlot;
  onChange: (meal: MealSlot) => void;
}) {
  return (
    <Segmented<MealSlot>
      value={value}
      onChange={onChange}
      size="sm"
      ariaLabel="Meal"
      options={MEAL_ORDER.map((meal) => ({
        value: meal,
        label: MEAL_LABELS[meal],
      }))}
    />
  );
}
