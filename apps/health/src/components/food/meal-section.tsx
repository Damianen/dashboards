import { FoodEntryRow } from "@/components/food/food-entry-row";
import type { FoodEntryView, MealGroup } from "@/lib/food";
import { formatNumber } from "@/lib/format";

/** One meal's heading + macro subtotal, with its swipeable entry rows. */
export function MealSection({
  group,
  day,
  onEdit,
}: {
  group: MealGroup;
  day: string;
  onEdit: (entry: FoodEntryView) => void;
}) {
  const s = group.subtotal;
  return (
    <section className="space-y-1.5">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-sm font-semibold">{group.label}</h2>
        <span className="text-muted-foreground text-xs tabular-nums">
          {formatNumber(s.kcal)} kcal · P{formatNumber(s.proteinG, 1)} · C
          {formatNumber(s.carbG, 1)} · F{formatNumber(s.fatG, 1)}
        </span>
      </div>
      <ul className="space-y-1.5">
        {group.entries.map((entry) => (
          <li key={entry.id}>
            <FoodEntryRow entry={entry} day={day} onEdit={onEdit} />
          </li>
        ))}
      </ul>
    </section>
  );
}
