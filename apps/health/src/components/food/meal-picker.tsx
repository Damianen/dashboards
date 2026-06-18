import { MEAL_LABELS, MEAL_ORDER, type MealSlot } from "@/lib/food";
import { cn } from "@/lib/utils";

/** A 4-up segmented control for choosing a meal slot. */
export function MealPicker({
  value,
  onChange,
}: {
  value: MealSlot;
  onChange: (meal: MealSlot) => void;
}) {
  return (
    <div className="bg-muted grid grid-cols-4 gap-1 rounded-lg p-1">
      {MEAL_ORDER.map((meal) => (
        <button
          key={meal}
          type="button"
          onClick={() => onChange(meal)}
          className={cn(
            "rounded-md py-2 text-xs font-medium transition-colors",
            value === meal
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground",
          )}
        >
          {MEAL_LABELS[meal]}
        </button>
      ))}
    </div>
  );
}
