/** One cell of a 4-up macro preview grid (value over a tiny uppercase label). */
export function PreviewStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="font-semibold tabular-nums">{value}</div>
      <div className="text-muted-foreground text-[10px] uppercase">{label}</div>
    </div>
  );
}
