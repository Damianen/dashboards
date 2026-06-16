import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/format";
import type { ExerciseGroup, PlainSet } from "@/lib/lifting-grouping";
import { cn } from "@/lib/utils";

/** One logged set, e.g. "8 × 80 kg @ RPE 8". Warmups are muted and badged. */
function SetLine({ set }: { set: PlainSet }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm tabular-nums",
        set.isWarmup && "text-muted-foreground",
      )}
    >
      <span>
        {set.reps} × {formatNumber(set.weightKg, 1)} kg
      </span>
      {set.rpe != null && (
        <span className="text-muted-foreground">
          @ RPE {formatNumber(set.rpe, 1)}
        </span>
      )}
      {set.isWarmup && (
        <Badge variant="outline" className="text-[10px]">
          warmup
        </Badge>
      )}
    </div>
  );
}

/** An exercise's sets within a session, with its working volume. */
export function ExerciseGroupRow({ group }: { group: ExerciseGroup }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{group.exerciseName}</span>
        {group.volumeKg > 0 && (
          <span className="text-muted-foreground text-xs tabular-nums">
            {formatNumber(group.volumeKg)} kg
          </span>
        )}
      </div>
      <div className="space-y-0.5 pl-1">
        {group.sets.map((set) => (
          <SetLine key={set.id} set={set} />
        ))}
      </div>
    </div>
  );
}
