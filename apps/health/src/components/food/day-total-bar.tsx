import type { MacroTotals } from "@/lib/food";
import { formatNumber } from "@/lib/format";

function Metric({
  value,
  unit,
  label,
}: {
  value: string;
  unit?: string;
  label: string;
}) {
  return (
    <div className="text-center">
      <div className="text-lg font-semibold tabular-nums leading-none">
        {value}
        {unit ? <span className="text-muted-foreground text-xs">{unit}</span> : null}
      </div>
      <div className="text-muted-foreground mt-1 text-[10px] tracking-wide uppercase">
        {label}
      </div>
    </div>
  );
}

/** Sticky day-total bar: the four summary macros for the selected day. */
export function DayTotalBar({ total }: { total: MacroTotals }) {
  return (
    <div className="bg-card/90 supports-[backdrop-filter]:bg-card/75 sticky top-2 z-20 grid grid-cols-4 gap-2 rounded-xl border px-3 py-3 shadow-sm backdrop-blur">
      <Metric value={formatNumber(total.kcal)} label="kcal" />
      <Metric value={formatNumber(total.proteinG, 1)} unit="g" label="protein" />
      <Metric value={formatNumber(total.carbG, 1)} unit="g" label="carbs" />
      <Metric value={formatNumber(total.fatG, 1)} unit="g" label="fat" />
    </div>
  );
}
